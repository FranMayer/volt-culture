import { MercadoPagoConfig, Preference } from 'mercadopago';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { computeAvailableStock } from '@/lib/server/stock';
import { applyRateLimit } from '@/lib/server/rate-limit';
import { SHIPPING_CONFIG } from '@/lib/shipping-config';
import { normalizeCouponCode, isCouponValid } from '@/lib/server/coupons';

function generateOrderId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = '';
    for (let i = 0; i < 6; i++) {
        token += chars[Math.floor(Math.random() * chars.length)];
    }
    return `VOLT-${token}`;
}

const SHIPPING_OPTIONS = new Set(Object.keys(SHIPPING_CONFIG));

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
        const cost = SHIPPING_CONFIG.cordoba.cost;
        return {
            shipping: { type: 'cordoba', cost },
            shippingCost: cost
        };
    }
    return {
        shipping: {
            type: 'andreani',
            cost: SHIPPING_CONFIG.andreani.cost,
            note: SHIPPING_CONFIG.andreani.note
        },
        shippingCost: SHIPPING_CONFIG.andreani.cost
    };
}

function normalizeAndreaniAddress(address) {
    if (!address || typeof address !== 'object' || Array.isArray(address)) {
        return { error: 'Para envío Andreani completá la dirección de entrega.' };
    }
    const street = String(address.street || '').trim();
    const city = String(address.city || '').trim();
    const province = String(address.province || '').trim();
    const postalCode = String(address.postalCode || '').trim();
    if (!street || !city || !province || !postalCode) {
        return {
            error:
                'Para envío Andreani completá calle y número, ciudad, provincia y código postal.'
        };
    }
    return {
        address: { street, city, province, postalCode }
    };
}

/** Una línea para metadata de Mercado Pago (límite práctico de caracteres). */
function shippingSummaryLine(shipping) {
    if (shipping.type === 'cordoba') {
        return `cordoba: Envío ${SHIPPING_CONFIG.cordoba.label} $${SHIPPING_CONFIG.cordoba.cost}`;
    }
    return `andreani: ${SHIPPING_CONFIG.andreani.note} por WhatsApp`;
}

const ALLOWED_ORIGINS = new Set([
    'https://voltculture.com.ar',
    'https://www.voltculture.com.ar',
    'http://localhost:3000',
    // ponytail: URL estable de preview de next-migration, agregada en F2 para
    // que el checkout funcione en el preview deploy. Quitar en el cutover (F10).
    'https://voltculture-git-next-migration-fran-mayers-projects.vercel.app'
]);

/**
 * Valida Origin y setea headers CORS. Devuelve false si el origin no está permitido.
 * @returns {boolean}
 */
function applyCors(req, res) {
    const origin = req.headers.origin;
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
        return false;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return true;
}

export default async function handler(req, res) {
    if (!applyCors(req, res)) {
        return res.status(403).json({ error: 'Origin no permitido' });
    }

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
    if (!(await applyRateLimit(req, res, 'create-preference'))) return;

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
        const dni = String(customer?.dni || '').trim();
        if (!/^\d{7,8}$/.test(dni)) {
            return res.status(400).json({ error: 'DNI inválido: debe tener 7 u 8 dígitos, sin puntos ni espacios.' });
        }
        const shipNorm = resolveShippingOption(shippingOption);
        if (shipNorm.error) {
            return res.status(400).json({ error: shipNorm.error });
        }
        const shipping = shipNorm.shipping;
        const shippingCost = shipNorm.shippingCost;

        if (shipping.type === 'andreani') {
            const addressInput = body.shipping?.address ?? body.shippingAddress;
            const addrNorm = normalizeAndreaniAddress(addressInput);
            if (addrNorm.error) {
                return res.status(400).json({ error: addrNorm.error });
            }
            shipping.address = addrNorm.address;
        }

        const normalizedItems = items.map(item => ({
            id: String(item.id || item.productId || '').trim(),
            title: String(item.title || 'Producto'),
            quantity: Math.max(1, Number(item.quantity) || 1),
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

        const db = adminDb();

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
                    const serverPrice = Number(data.price);
                    if (!Number.isFinite(serverPrice) || serverPrice <= 0) {
                        const err = new Error(`Precio inválido en catálogo: ${item.title}`);
                        err.code = 'STOCK_INSUFFICIENT';
                        throw err;
                    }
                    item.price = serverPrice;
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

        // Cupón válido: baja el unit_price de cada producto en su %.
        let coupon = null;
        let discountSource = null;
        let discountPercent = 0;
        const couponCode = normalizeCouponCode(body.couponCode);
        if (couponCode) {
            const couponSnap = await db.collection('coupons').doc(couponCode).get();
            const couponData = couponSnap.exists ? couponSnap.data() : null;
            if (isCouponValid(couponData).valid) {
                coupon = couponData.code || couponCode;
                discountSource = 'coupon';
                discountPercent = Number(couponData.percent);
            }
        }

        const discountedItems = normalizedItems.map((i) => ({
            ...i,
            unitPrice: discountPercent ? Math.round(i.price * (100 - discountPercent) / 100) : i.price
        }));
        const discountedProductsTotal = discountedItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
        const discountAmount = productsTotal - discountedProductsTotal;
        const subtotal = productsTotal + shippingCost;
        const total = discountedProductsTotal + shippingCost;
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
                    email: String(customer.email).trim(),
                    dni
                },
                shipping,
                items: normalizedItems,
                subtotal,
                discountPercent,
                discountAmount,
                coupon,
                discountSource,
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

        // ponytail: best-effort. Bajo alta concurrencia dos órdenes podrían pasar el
        // límite por 1; para un cupón de descuento es tolerable. Estricto = transacción.
        if (discountSource === 'coupon' && couponCode) {
            try {
                await db.collection('coupons').doc(couponCode).update({ usedCount: FieldValue.increment(1) });
            } catch (e) {
                console.warn('[create-preference] No se pudo incrementar usedCount del cupón:', e.message);
            }
        }

        const mpItems = discountedItems.map((item, index) => ({
            id: `${item.id}-${index}`,
            title: item.title,
            description: [item.title, item.variantColor, item.variantSize].filter(Boolean).join(' · ') || item.title,
            category_id: 'fashion',
            quantity: item.quantity,
            currency_id: 'ARS',
            unit_price: item.unitPrice
        }));

        if (shipping.type === 'cordoba') {
            mpItems.push({
                id: 'shipping-cordoba',
                title: `Envío ${SHIPPING_CONFIG.cordoba.label}`,
                description: `Envío ${SHIPPING_CONFIG.cordoba.label} (dentro de circunvalación)`,
                category_id: 'others',
                quantity: 1,
                currency_id: 'ARS',
                unit_price: SHIPPING_CONFIG.cordoba.cost
            });
        }

        const siteUrl = process.env.SITE_URL || 'https://www.voltculture.com.ar';
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
