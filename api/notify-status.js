import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import { formatShippingBlockClientHtml } from './_shipping-email.js';
import { verifyAdmin } from './_verify-admin.js';
import { applyStockDecrement } from './_stock.js';

function initAdmin() {
    const projectId   = (process.env.FIREBASE_PROJECT_ID   || '').replace(/^"|"$/g, '').trim();
    const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').replace(/^"|"$/g, '').trim();
    const privateKey  = (process.env.FIREBASE_PRIVATE_KEY  || '')
        .replace(/\\n/g, '\n').replace(/^"|"$/g, '').trim();

    if (!getApps().length) {
        initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    }
    return getFirestore();
}

const STATUS_SUBJECTS = {
    paid:            'Tu pedido VOLT fue confirmado ✅',
    shipped:         'Tu pedido VOLT está en camino 🚚',
    delivered:       'Tu pedido VOLT fue entregado 📦',
    cancelled:       'Tu pedido VOLT fue cancelado',
    pending_payment: 'Tu pedido VOLT está pendiente de pago',
};

function buildStatusMessage(status, name, order) {
    const safeName = name || 'Cliente VOLT';
    switch (status) {
        case 'paid':
            if (order?.paymentMethod === 'transfer') {
                return `Hola ${safeName}, recibimos tu transferencia y tu pedido está siendo preparado.`;
            }
            return `Hola ${safeName}, tu pago fue confirmado y tu pedido está siendo preparado.`;
        case 'shipped':
            return `Hola ${safeName}, tu pedido está en camino. Pronto lo vas a recibir.`;
        case 'delivered':
            return `Hola ${safeName}, tu pedido fue entregado. ¡Gracias por comprar en VOLT!`;
        case 'cancelled':
            return `Hola ${safeName}, tu pedido fue cancelado. Si tenés dudas, respondé este mail.`;
        case 'pending_payment':
            return `Hola ${safeName}, tu pedido está pendiente de pago. Una vez confirmado, te avisamos.`;
        default:
            return `Hola ${safeName}, hay novedades en tu pedido.`;
    }
}

/**
 * Transición a `paid` desde el admin. Idempotente: si `inventoryAdjusted` ya
 * es true (p.ej. orden MP que el webhook ya cerró), solo actualiza status y
 * timestamps. Caso típico: transferencia confirmada manualmente por el admin.
 *
 * @returns {Promise<{decremented: boolean}>}
 */
async function applyAdminPaidTransition(db, orderRef) {
    let decremented = false;
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(orderRef);
        if (!snap.exists) {
            const err = new Error('Orden no encontrada');
            err.code = 'ORDER_NOT_FOUND';
            throw err;
        }
        const o = snap.data();

        if (o.inventoryAdjusted === true) {
            tx.set(
                orderRef,
                {
                    status: 'paid',
                    paidAt: o.paidAt || FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp()
                },
                { merge: true }
            );
            return;
        }

        const items = Array.isArray(o.items) ? o.items : [];
        const productSnaps = [];
        for (const item of items) {
            const pid = item.id || item.productId;
            if (!pid) {
                console.warn('[notify-status] Ítem sin id de producto, sin decremento:', item.title || '?');
                productSnaps.push(null);
                continue;
            }
            const pref = db.collection('products').doc(pid);
            const psnap = await tx.get(pref);
            productSnaps.push({ pref, psnap });
        }

        items.forEach((item, idx) => {
            const entry = productSnaps[idx];
            if (!entry || !entry.psnap.exists) return;
            const { variants, sizes, stock } = applyStockDecrement(
                entry.psnap.data(),
                item.quantity,
                item.variantColor,
                item.variantSize
            );
            tx.update(entry.pref, {
                variants,
                sizes,
                stock,
                updatedAt: FieldValue.serverTimestamp()
            });
        });

        tx.set(
            orderRef,
            {
                status: 'paid',
                inventoryAdjusted: true,
                paidAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            },
            { merge: true }
        );
        decremented = true;
    });
    return { decremented };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const decoded = await verifyAdmin(req, res);
    if (!decoded) return;

    const { orderId, status, trackingNumber: trackingNumberRaw } = req.body || {};
    if (!orderId || !status) return res.status(400).json({ error: 'Faltan orderId o status' });

    if (!STATUS_SUBJECTS[status]) {
        return res.status(400).json({ error: `Estado desconocido: ${status}` });
    }

    try {
        const db = initAdmin();
        const orderRef = db.collection('orders').doc(orderId);
        const snap = await orderRef.get();
        if (!snap.exists) return res.status(404).json({ error: 'Orden no encontrada' });

        const orderBefore = snap.data();

        // Caso especial: pasar a `paid` puede requerir descontar stock (transferencia).
        // La transacción es idempotente vía `inventoryAdjusted`.
        let stockDecremented = false;
        if (status === 'paid') {
            try {
                const result = await applyAdminPaidTransition(db, orderRef);
                stockDecremented = result.decremented;
            } catch (e) {
                if (e.code === 'ORDER_NOT_FOUND') {
                    return res.status(404).json({ error: 'Orden no encontrada' });
                }
                throw e;
            }
        } else {
            const updatePayload = {
                status,
                updatedAt: FieldValue.serverTimestamp()
            };

            let trackingNumber = '';
            if (status === 'shipped') {
                trackingNumber = String(trackingNumberRaw || '').trim();
                const existingShipping =
                    orderBefore.shipping && typeof orderBefore.shipping === 'object'
                        ? orderBefore.shipping
                        : {};
                updatePayload.shipping = {
                    ...existingShipping,
                    carrier: 'Andreani'
                };
                if (trackingNumber) {
                    updatePayload.shipping.trackingNumber = trackingNumber;
                }
            }

            await orderRef.update(updatePayload);
        }

        // Releer la orden post-update para tener timestamps y campos finales coherentes.
        const finalSnap = await orderRef.get();
        const order = finalSnap.exists ? finalSnap.data() : orderBefore;

        let trackingNumber = '';
        if (status === 'shipped') {
            trackingNumber = String(trackingNumberRaw || '').trim();
            if (!trackingNumber && order.shipping?.trackingNumber) {
                trackingNumber = String(order.shipping.trackingNumber).trim();
            }
        }
        const customer = order.customer || {};
        const customerEmail = customer.email;
        const customerName = customer.name || 'Cliente VOLT';

        if (!process.env.RESEND_API_KEY || !customerEmail) {
            console.warn('[notify-status] Email omitido:', !process.env.RESEND_API_KEY ? 'sin RESEND_API_KEY' : 'sin email de cliente');
            return res.status(200).json({ ok: true, emailSent: false, stockDecremented });
        }

        const items = Array.isArray(order.items) ? order.items : [];
        const total = Number(order.total || 0);

        const itemsHtml = items.length
            ? items.map(i => {
                const qty = Number(i.quantity || 1);
                const price = Number(i.price || 0);
                return `<li style="margin:0 0 6px 0;">${i.title || 'Producto'} x${qty} — $${price.toLocaleString('es-AR')}</li>`;
            }).join('')
            : '<li>Sin detalle de productos</li>';

        const subject = STATUS_SUBJECTS[status];
        const mainMsg = buildStatusMessage(status, customerName, order);
        const shippingHtml = formatShippingBlockClientHtml(order);

        let trackingHtml = '';
        if (status === 'shipped' && trackingNumber) {
            const trackUrl = `https://www.andreani.com/#!/informacionEnvio/${encodeURIComponent(trackingNumber)}`;
            const safeTrack = trackingNumber
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            trackingHtml = `
                    <div style="margin:0 0 20px 0;padding:14px 16px;background:#1a1a1a;border:1px solid #333;border-radius:4px;">
                        <p style="margin:0 0 8px 0;font-size:15px;"><strong>Seguimiento Andreani:</strong> ${safeTrack}</p>
                        <p style="margin:0;"><a href="${trackUrl}" style="color:#c1121f;text-decoration:underline;">Seguir envío en Andreani</a></p>
                    </div>`;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
            from: 'VOLT Store <noreply@voltculture.com.ar>',
            to: customerEmail,
            subject,
            html: `
                <div style="background:#0b0b0b;color:#f2f2f2;padding:32px 24px;font-family:Arial,Helvetica,sans-serif;line-height:1.6;max-width:560px;margin:0 auto;">
                    <h1 style="margin:0 0 16px 0;color:#c1121f;font-size:22px;letter-spacing:0.05em;">⚡ VOLT</h1>
                    <p style="margin:0 0 16px 0;font-size:16px;">${mainMsg}</p>
                    ${trackingHtml}
                    <p style="margin:0 0 8px 0;"><strong>Número de orden:</strong> ${order.orderId || orderId}</p>
                    <p style="margin:0 0 16px 0;"><strong>Total:</strong> $${total.toLocaleString('es-AR')}</p>
                    <h2 style="margin:0 0 8px 0;color:#c1121f;font-size:16px;">Envío</h2>
                    ${shippingHtml}
                    <h2 style="margin:0 0 8px 0;color:#c1121f;font-size:16px;">Productos</h2>
                    <ul style="margin:0 0 24px 18px;padding:0;">${itemsHtml}</ul>
                    <p style="margin:0;color:#888;font-size:12px;">VOLT — Motorsport Culture · voltculture.com.ar</p>
                </div>
            `
        });

        return res.status(200).json({ ok: true, emailSent: true, stockDecremented });
    } catch (err) {
        console.error('[notify-status] Error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
