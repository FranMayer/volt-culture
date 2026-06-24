/**
 * VOLT Store — Orden por transferencia bancaria.
 *
 * Crea una orden en Firestore con status `pending_transfer` y valida stock
 * server-side (sin descontar). El descuento real de inventario y la
 * confirmación se disparan cuando el admin marca la orden como `paid`
 * desde el panel (ver api/notify-status.js).
 *
 * No integra Mercado Pago ni envía notificaciones al admin al crear.
 *
 * Variables de entorno (Vercel / hosting):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { computeAvailableStock } from './_stock.js';
import { applyRateLimit } from './_rate-limit.js';
import { SHIPPING_CONFIG } from '../js/shipping-config.js';
import { normalizeCouponCode, isCouponValid, computeCouponDiscount } from './_coupons.js';

const TRANSFER_DISCOUNT_RATE = 0.10;

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
            credential: cert({ projectId, clientEmail, privateKey })
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
        // Andreani: el costo real se coordina por WhatsApp. No sumamos al total.
        shippingCost: 0
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

const ALLOWED_ORIGINS = new Set([
    'https://voltculture.com.ar',
    'https://www.voltculture.com.ar',
    'http://localhost:3000'
]);

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
    // Reutilizamos el bucket de create-preference: ambos crean órdenes, mismo perfil de abuso.
    if (!(await applyRateLimit(req, res, 'create-preference'))) return;

    try {
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch { body = {}; }
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

        if (shipping.type === 'andreani') {
            const addressInput = body.shipping?.address ?? body.shippingAddress;
            const addrNorm = normalizeAndreaniAddress(addressInput);
            if (addrNorm.error) {
                return res.status(400).json({ error: addrNorm.error });
            }
            shipping.address = addrNorm.address;
        }

        const normalizedItems = items.map((item) => ({
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

        const productsTotal = normalizedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
        const subtotal = productsTotal + shippingCost;

        // Default: descuento por transferencia (−10% sobre subtotal).
        let coupon = null;
        let discountSource = 'transfer';
        let discountPercent = Math.round(TRANSFER_DISCOUNT_RATE * 100);
        let discountAmount = Math.round(subtotal * TRANSFER_DISCOUNT_RATE);

        // Cupón válido REEMPLAZA al −10% (descuento solo sobre productos).
        const couponCode = normalizeCouponCode(body.couponCode);
        if (couponCode) {
            const couponSnap = await db.collection('coupons').doc(couponCode).get();
            const couponData = couponSnap.exists ? couponSnap.data() : null;
            if (isCouponValid(couponData).valid) {
                coupon = couponData.code || couponCode;
                discountSource = 'coupon';
                discountPercent = Number(couponData.percent);
                discountAmount = computeCouponDiscount(productsTotal, discountPercent);
            }
        }

        const total = subtotal - discountAmount;

        const orderId = generateOrderId();
        const orderRef = db.collection('orders').doc(orderId);

        try {
            await orderRef.set({
                orderId,
                status: 'pending_transfer',
                paymentMethod: 'transfer',
                createdAt: FieldValue.serverTimestamp(),
                customer: {
                    name: String(customer.name).trim(),
                    phone: String(customer.phone).trim(),
                    email: String(customer.email).trim()
                },
                shipping,
                items: normalizedItems,
                subtotal,
                coupon,
                discountSource,
                discountPercent,
                discountAmount,
                total,
                paymentId: null,
                paidAt: null,
                inventoryAdjusted: false,
                updatedAt: FieldValue.serverTimestamp()
            });
        } catch (firestoreError) {
            return res.status(500).json({
                error: 'No se pudo crear la orden en Firestore',
                details: firestoreError.message
            });
        }

        return res.status(200).json({
            orderId,
            total,
            subtotal,
            discountAmount,
            discountPercent,
            discountSource,
            coupon
        });
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
