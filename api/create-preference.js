import { MercadoPagoConfig, Preference } from 'mercadopago';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { computeAvailableStock } from './_stock.js';

function initAdmin() {
    if (!process.env.FIREBASE_PRIVATE_KEY) {
        throw new Error('FIREBASE_PRIVATE_KEY no configurada en entorno');
    }
    const projectId = (process.env.FIREBASE_PROJECT_ID || '').replace(/^"|"$/g, '').trim();
    const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').replace(/^"|"$/g, '').trim();
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '')
        .replace(/\\n/g, '\n')
        .replace(/^"|"$/g, '')
        .trim();
    if (!projectId || !clientEmail || !privateKey) {
        throw new Error('Credenciales Firebase incompletas: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY');
    }

    if (!getApps().length) {
        initializeApp({
            credential: cert({
                projectId,
                clientEmail,
                privateKey
            })
        });
    }
    return getFirestore();
}

function generateOrderId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = '';
    for (let i = 0; i < 6; i++) {
        token += chars[Math.floor(Math.random() * chars.length)];
    }
    return `VOLT-${token}`;
}

const SHIPPING_OPTIONS = new Set(['cordoba', 'andreani']);
const CORDOBA_SHIPPING_COST = 2500;

function resolveShippingOption(shippingOption) {
    const option = String(shippingOption || '')
        .trim()
        .toLowerCase();
    if (!SHIPPING_OPTIONS.has(option)) {
        return {
            error:
                option === ''
                    ? 'Elegí una opción de envío en el paso 2 del checkout.'
                    : `Opción de envío inválida: "${shippingOption}". Usá cordoba o andreani.`
        };
    }
    if (option === 'cordoba') {
        return {
            shipping: { type: 'cordoba', cost: CORDOBA_SHIPPING_COST },
            shippingCost: CORDOBA_SHIPPING_COST
        };
    }
    return {
        shipping: { type: 'andreani', cost: 0, note: 'A coordinar' },
        shippingCost: 0
    };
}

/** Una línea para metadata de Mercado Pago (límite práctico de caracteres). */
function shippingSummaryLine(shipping) {
    if (shipping.type === 'cordoba') {
        return `cordoba: Envío Córdoba Capital $${CORDOBA_SHIPPING_COST}`;
    }
    return 'andreani: A coordinar por WhatsApp';
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    try {
        if (!process.env.MP_ACCESS_TOKEN) {
            return res.status(500).json({
                error: 'MP_ACCESS_TOKEN no configurado',
                details: 'Definí MP_ACCESS_TOKEN en Vercel Project Settings > Environment Variables'
            });
        }

        let body = req.body;
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch {
                body = {};
            }
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            body = {};
        }

        const items = body.items;
        const customer = body.customer;
        const shippingOption = body.shippingOption ?? body.shipping?.type;
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'El carrito está vacío' });
        }
        if (!customer?.name || !customer?.phone || !customer?.email) {
            return res.status(400).json({ error: 'Faltan datos del cliente (nombre, teléfono y email)' });
        }
        const shipNorm = resolveShippingOption(shippingOption);
        if (shipNorm.error) {
            return res.status(400).json({ error: shipNorm.error });
        }
        const shipping = shipNorm.shipping;
        const shippingCost = shipNorm.shippingCost;

        const normalizedItems = items.map(item => ({
            id: String(item.id || item.productId || '').trim(),
            title: String(item.title || 'Producto'),
            quantity: Math.max(1, Number(item.quantity) || 1),
            price: Math.max(0, Number(item.price) || 0),
            image: item.image || '',
            variantColor: item.variantColor || '',
            variantSize: item.variantSize || ''
        }));

        for (const it of normalizedItems) {
            if (!it.id) {
                return res.status(400).json({
                    error: 'Cada producto del carrito debe incluir su id de Firestore para validar stock.'
                });
            }
        }

        const db = initAdmin();

        try {
            await db.runTransaction(async (t) => {
                for (const item of normalizedItems) {
                    const pref = db.collection('products').doc(item.id);
                    const snap = await t.get(pref);
                    if (!snap.exists) {
                        const err = new Error(`Producto no encontrado: ${item.title}`);
                        err.code = 'STOCK_INSUFFICIENT';
                        throw err;
                    }
                    const data = snap.data();
                    if (data.active === false) {
                        const err = new Error(`Producto no disponible: ${item.title}`);
                        err.code = 'STOCK_INSUFFICIENT';
                        throw err;
                    }
                    const available = computeAvailableStock(data, item.variantColor, item.variantSize);
                    if (available < item.quantity) {
                        const err = new Error(`Stock insuficiente para ${item.title}`);
                        err.code = 'STOCK_INSUFFICIENT';
                        throw err;
                    }
                }
            });
        } catch (e) {
            if (e.code === 'STOCK_INSUFFICIENT') {
                return res.status(400).json({ error: e.message });
            }
            throw e;
        }

        const productsTotal = normalizedItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const total = productsTotal + shippingCost;
        const orderId = generateOrderId();
        const orderRef = db.collection('orders').doc(orderId);

        try {
            await orderRef.set({
                orderId,
                status: 'pending',
                createdAt: FieldValue.serverTimestamp(),
                customer: {
                    name: String(customer.name).trim(),
                    phone: String(customer.phone).trim(),
                    email: String(customer.email).trim()
                },
                shipping,
                items: normalizedItems,
                total,
                paymentId: null,
                paidAt: null,
                updatedAt: FieldValue.serverTimestamp()
            });
        } catch (firestoreError) {
            return res.status(500).json({
                error: 'No se pudo crear la orden en Firestore',
                details: firestoreError.message
            });
        }

        const mpItems = normalizedItems.map((item, index) => ({
            id: `${item.id}-${index}`,
            title: item.title,
            description: [item.title, item.variantColor, item.variantSize].filter(Boolean).join(' · ') || item.title,
            category_id: 'fashion',
            quantity: item.quantity,
            currency_id: 'ARS',
            unit_price: item.price
        }));

        if (shipping.type === 'cordoba') {
            mpItems.push({
                id: 'shipping-cordoba',
                title: 'Envío Córdoba Capital',
                description: 'Envío Córdoba Capital (dentro de circunvalación)',
                category_id: 'others',
                quantity: 1,
                currency_id: 'ARS',
                unit_price: CORDOBA_SHIPPING_COST
            });
        }

        const siteUrl = process.env.SITE_URL || 'https://voltculture.com.ar';
        const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
        const preference = new Preference(client);

        try {
            const result = await preference.create({
                body: {
                    items: mpItems,
                    statement_descriptor: 'VOLT Store',
                    external_reference: orderId,
                    back_urls: {
                        success: `${siteUrl}/pages/success.html?order=${orderId}`,
                        failure: `${siteUrl}/pages/failure.html?order=${orderId}`,
                        pending: `${siteUrl}/pages/pending.html?order=${orderId}`
                    },
                    auto_return: 'approved',
                    notification_url: `${siteUrl}/api/webhook`,
                    metadata: {
                        order_id: orderId,
                        customer_name: String(customer.name).trim(),
                        customer_phone: String(customer.phone).trim(),
                        customer_email: String(customer.email).trim(),
                        shipping_option: shipping.type,
                        shipping_summary: shippingSummaryLine(shipping)
                    }
                }
            });

            return res.status(200).json({
                init_point: result.init_point || result.sandbox_init_point,
                orderId
            });
        } catch (mpError) {
            await orderRef.update({
                status: 'mp_error',
                updatedAt: FieldValue.serverTimestamp(),
                mpError: mpError.message
            });
            return res.status(500).json({
                error: 'Error al crear preferencia en Mercado Pago',
                details: mpError.message
            });
        }
    } catch (error) {
        if (error.message?.includes('Invalid PEM formatted message')) {
            return res.status(500).json({
                error: 'Error de credenciales de Firebase (PEM inválido)',
                details: 'Revisá FIREBASE_PRIVATE_KEY en Vercel: debe incluir BEGIN/END PRIVATE KEY y saltos de línea válidos.'
            });
        }
        if (error.message?.includes('UNAUTHENTICATED')) {
            return res.status(500).json({
                error: 'Firebase no autenticó la service account',
                details: 'Verificá en Vercel que FIREBASE_PROJECT_ID y FIREBASE_CLIENT_EMAIL coincidan con la misma service account que FIREBASE_PRIVATE_KEY.'
            });
        }
        return res.status(500).json({ error: 'Error interno', details: error.message });
    }
}
