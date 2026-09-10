import { FieldValue } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import { adminDb } from '@/lib/firebase/admin';
import { formatShippingBlockClientHtml } from '@/lib/server/shipping-email';
import { verifyAdmin } from '@/lib/server/verify-admin';

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
 * `inventoryAdjusted` es un nombre legado: ya no descuenta stock (VOLT dejó
 * de manejar stock numérico), pero se mantiene como marca de idempotencia —
 * mismo criterio que pages/api/webhook.js#applyPaidTransition.
 */
async function applyAdminPaidTransition(db, orderRef) {
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
    });
}

/**
 * Cancelación desde el admin. Ya no repone inventario (no hay stock numérico
 * que reponer) — solo cambia el estado a `cancelled`.
 */
async function applyCancelTransition(db, orderRef) {
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(orderRef);
        if (!snap.exists) {
            const err = new Error('Orden no encontrada');
            err.code = 'ORDER_NOT_FOUND';
            throw err;
        }
        tx.set(
            orderRef,
            {
                status: 'cancelled',
                updatedAt: FieldValue.serverTimestamp()
            },
            { merge: true }
        );
    });
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
        const db = adminDb();
        const orderRef = db.collection('orders').doc(orderId);
        const snap = await orderRef.get();
        if (!snap.exists) return res.status(404).json({ error: 'Orden no encontrada' });

        const orderBefore = snap.data();

        // Caso especial: la transacción de `paid` es idempotente vía `inventoryAdjusted`.
        if (status === 'paid') {
            try {
                await applyAdminPaidTransition(db, orderRef);
            } catch (e) {
                if (e.code === 'ORDER_NOT_FOUND') {
                    return res.status(404).json({ error: 'Orden no encontrada' });
                }
                throw e;
            }
        } else if (status === 'cancelled') {
            try {
                await applyCancelTransition(db, orderRef);
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
            return res.status(200).json({ ok: true, emailSent: false });
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

        return res.status(200).json({ ok: true, emailSent: true });
    } catch (err) {
        console.error('[notify-status] Error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
