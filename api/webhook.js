import { MercadoPagoConfig, Payment } from 'mercadopago';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import { createHmac } from 'crypto';
import { applyStockDecrement } from './_stock.js';
import { applyRateLimit } from './_rate-limit.js';

const ADMIN_SALE_EMAIL = 'volt.streetcba@gmail.com';

function initAdmin() {
    const projectId = (process.env.FIREBASE_PROJECT_ID || '').replace(/^"|"$/g, '').trim();
    const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').replace(/^"|"$/g, '').trim();
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '')
        .replace(/\\n/g, '\n')
        .replace(/^"|"$/g, '')
        .trim();

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

function verifyMpSignature(xSignature, xRequestId, dataId) {
    const secret = process.env.MP_WEBHOOK_SECRET;
    if (!secret) {
        console.warn('[Webhook] MP_WEBHOOK_SECRET no configurado — saltando verificación de firma');
        return true;
    }

    const parts = {};
    for (const part of xSignature.split(',')) {
        const [key, val] = part.split('=');
        if (key && val) parts[key.trim()] = val.trim();
    }

    const { ts, v1 } = parts;
    if (!ts || !v1) return false;

    const template = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const computed = createHmac('sha256', secret).update(template).digest('hex');

    return computed === v1;
}

function mapStatus(mpStatus) {
    if (mpStatus === 'approved') return 'paid';
    if (mpStatus === 'rejected' || mpStatus === 'cancelled') return 'failed';
    if (mpStatus === 'in_process' || mpStatus === 'pending') return 'pending_payment';
    return 'pending_payment';
}

const STATUS_PRIORITY = {
    pending: 0,
    pending_payment: 0,
    failed: 1,
    mp_error: 1,
    paid: 2,
    shipped: 3,
    delivered: 4,
    cancelled: 5
};

function escapeHtmlAttr(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatItemLineHtml(item) {
    const title = escapeHtmlAttr(item.title || 'Producto');
    const qty = Number(item.quantity || 1);
    const price = Number(item.price || 0);
    const color = item.variantColor ? escapeHtmlAttr(String(item.variantColor)) : '';
    const size = item.variantSize ? escapeHtmlAttr(String(item.variantSize)) : '';
    let line = `${title}`;
    if (color || size) {
        const bits = [];
        if (color) bits.push(`Color: ${color}`);
        if (size) bits.push(`Talle: ${size}`);
        line += ` <span style="color:#bdbdbd;">(${bits.join(' · ')})</span>`;
    }
    return `<li style="margin:0 0 6px 0;">${line} ×${qty} — $${price.toLocaleString('es-AR')}</li>`;
}

const SHIPPING_METHOD_LABELS = {
    cadete: 'Cadete en moto (Córdoba Capital)',
    andreani: 'Andreani',
    correo: 'Correo Argentino',
    coordinar: 'Coordinar entrega'
};

/** Bloque HTML de envío para el cliente (orden nueva con `shipping` u orden legada). */
function formatShippingBlockClientHtml(orderData) {
    const s = orderData.shipping;
    if (s && s.method && SHIPPING_METHOD_LABELS[s.method]) {
        const label = escapeHtmlAttr(SHIPPING_METHOD_LABELS[s.method]);
        const parts = [`<p style="margin:0 0 8px 0;"><strong>Método de envío:</strong> ${label}</p>`];
        if (s.method === 'andreani' || s.method === 'correo') {
            const a = s.address || {};
            parts.push(
                `<p style="margin:0 0 4px 0;"><strong>Dirección:</strong> ${escapeHtmlAttr(a.street || '')}</p>`,
                `<p style="margin:0 0 4px 0;"><strong>Ciudad:</strong> ${escapeHtmlAttr(a.city || '')} · <strong>Provincia:</strong> ${escapeHtmlAttr(a.province || '')}</p>`,
                `<p style="margin:0 0 8px 0;"><strong>Código postal:</strong> ${escapeHtmlAttr(a.postalCode || '')}</p>`,
                `<p style="margin:0 0 12px 0;color:#bdbdbd;font-size:13px;">El costo de envío se coordina por WhatsApp después de la compra.</p>`
            );
        } else if (s.method === 'cadete') {
            parts.push(
                `<p style="margin:0 0 12px 0;color:#bdbdbd;font-size:13px;">Coordinamos la entrega por WhatsApp (Córdoba Capital).</p>`
            );
        } else if (s.method === 'coordinar' && s.notes) {
            parts.push(`<p style="margin:0 0 12px 0;"><strong>Tu indicación:</strong> ${escapeHtmlAttr(s.notes)}</p>`);
        }
        return parts.join('');
    }
    const c = orderData.customer || {};
    return `
        <p style="margin:0 0 8px 0;"><strong>Dirección de envío:</strong> ${escapeHtmlAttr(c.address || 'Sin dirección')}</p>
        <p style="margin:0 0 12px 0;"><strong>Código postal:</strong> ${escapeHtmlAttr(c.postalCode || 'Sin código postal')}</p>
    `;
}

/** Bloque HTML de envío para el admin (incluye notas completas). */
function formatShippingBlockAdminHtml(orderData) {
    const s = orderData.shipping;
    if (s && s.method && SHIPPING_METHOD_LABELS[s.method]) {
        const label = escapeHtmlAttr(SHIPPING_METHOD_LABELS[s.method]);
        const parts = [`<p style="margin:0 0 8px 0;"><strong>Método de envío:</strong> ${label}</p>`];
        if (s.method === 'andreani' || s.method === 'correo') {
            const a = s.address || {};
            parts.push(
                `<p style="margin:0 0 4px 0;"><strong>Calle y número:</strong> ${escapeHtmlAttr(a.street || '')}</p>`,
                `<p style="margin:0 0 4px 0;"><strong>Ciudad:</strong> ${escapeHtmlAttr(a.city || '')}</p>`,
                `<p style="margin:0 0 4px 0;"><strong>Provincia:</strong> ${escapeHtmlAttr(a.province || '')}</p>`,
                `<p style="margin:0 0 8px 0;"><strong>Código postal:</strong> ${escapeHtmlAttr(a.postalCode || '')}</p>`
            );
        } else if (s.method === 'cadete') {
            parts.push(`<p style="margin:0 0 8px 0;color:#bdbdbd;">Córdoba Capital — coordinar por WhatsApp.</p>`);
        }
        if (s.notes) {
            parts.push(`<p style="margin:0 0 12px 0;"><strong>Nota / indicación:</strong> ${escapeHtmlAttr(s.notes)}</p>`);
        } else {
            parts.push('<p style="margin:0 0 12px 0;"></p>');
        }
        return parts.join('');
    }
    const c = orderData.customer || {};
    return `
        <p style="margin:0 0 8px 0;"><strong>Dirección:</strong> ${escapeHtmlAttr(c.address || '-')}</p>
        <p style="margin:0 0 12px 0;"><strong>Código postal:</strong> ${escapeHtmlAttr(c.postalCode || '-')}</p>
    `;
}

function plainWhatsApp(s) {
    return String(s ?? '')
        .trim()
        .replace(/\r\n/g, '\n');
}

function formatOrderItemsWhatsAppLines(items) {
    const arr = Array.isArray(items) ? items : [];
    if (arr.length === 0) return '- (sin detalle)';
    return arr
        .map((item) => {
            const title = plainWhatsApp(item.title || item.name || 'Producto') || 'Producto';
            const talle = plainWhatsApp(item.variantSize) || '—';
            const color = plainWhatsApp(item.variantColor) || '—';
            const qty = Number(item.quantity || 1);
            return `- ${title} | Talle: ${talle} | Color: ${color} | x${qty}`;
        })
        .join('\n');
}

/** Bloque ENVÍO en texto plano para CallMeBot (sin HTML). */
function formatShippingWhatsAppBlock(orderData) {
    const s = orderData.shipping;
    if (s && s.method && SHIPPING_METHOD_LABELS[s.method]) {
        const label = SHIPPING_METHOD_LABELS[s.method];
        const lines = [`ENVÍO: ${label}`];
        if (s.method === 'andreani' || s.method === 'correo') {
            const a = s.address || {};
            lines.push(
                `Dirección: ${plainWhatsApp(a.street) || '—'}, ${plainWhatsApp(a.city) || '—'}, ${plainWhatsApp(a.province) || '—'} CP:${plainWhatsApp(a.postalCode) || '—'}`
            );
        } else if (s.method === 'cadete') {
            lines.push('Coordinar por WhatsApp');
        } else if (s.method === 'coordinar') {
            lines.push(`Nota: ${plainWhatsApp(s.notes) || '—'}`);
        }
        return lines.join('\n');
    }
    const c = orderData.customer || {};
    return [
        'ENVÍO: (pedido anterior)',
        `Dirección: ${plainWhatsApp(c.address) || '—'}`,
        `CP: ${plainWhatsApp(c.postalCode) || '—'}`
    ].join('\n');
}

function buildAdminWhatsAppMessage(orderData) {
    const orderId = plainWhatsApp(orderData.orderId) || '(sin id)';
    const customer = orderData.customer || {};
    const items = orderData.items || [];
    const total = Number(orderData.total || 0);

    return [
        '🏁 NUEVA VENTA VOLT',
        `Orden: #${orderId}`,
        `Cliente: ${plainWhatsApp(customer.name) || '—'}`,
        `Mail: ${plainWhatsApp(customer.email) || '—'}`,
        `Tel: ${plainWhatsApp(customer.phone) || '—'}`,
        '',
        'PRODUCTOS:',
        formatOrderItemsWhatsAppLines(items),
        '',
        formatShippingWhatsAppBlock(orderData),
        '',
        `TOTAL: $${total.toLocaleString('es-AR')}`
    ].join('\n');
}

/**
 * Notificación al admin vía CallMeBot (WhatsApp). Requiere ADMIN_WHATSAPP_NUMBER y ADMIN_WHATSAPP_APIKEY.
 */
async function sendAdminWhatsApp(orderData) {
    const phoneRaw = process.env.ADMIN_WHATSAPP_NUMBER;
    const apikeyRaw = process.env.ADMIN_WHATSAPP_APIKEY;
    if (!plainWhatsApp(phoneRaw) || !plainWhatsApp(apikeyRaw)) {
        console.warn(
            '[Webhook] ADMIN_WHATSAPP_NUMBER o ADMIN_WHATSAPP_APIKEY no definidos — skip notificación WhatsApp al admin'
        );
        return;
    }
    const phone = plainWhatsApp(phoneRaw).replace(/\s/g, '').replace(/^\+/, '');
    const apikey = plainWhatsApp(apikeyRaw);
    const text = buildAdminWhatsAppMessage(orderData);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
    const waRes = await fetch(url, { method: 'GET' });
    if (!waRes.ok) {
        const body = await waRes.text().catch(() => '');
        throw new Error(`CallMeBot HTTP ${waRes.status}: ${body}`);
    }
}

/**
 * Transacción: idempotente con inventoryAdjusted; descuenta stock solo la primera vez.
 */
async function applyPaidTransition(db, orderRef, paymentInfo) {
    const paymentId = String(paymentInfo.id);
    const mpStatus = paymentInfo.status;

    await db.runTransaction(async (tx) => {
        const snap = await tx.get(orderRef);
        if (!snap.exists) return;

        const o = snap.data();
        const paidP = STATUS_PRIORITY.paid;
        const curP = STATUS_PRIORITY[o.status] ?? -1;

        if (o.inventoryAdjusted === true) {
            tx.set(
                orderRef,
                {
                    paymentId,
                    mpStatus,
                    updatedAt: FieldValue.serverTimestamp()
                },
                { merge: true }
            );
            return;
        }

        if (curP > paidP) {
            tx.set(
                orderRef,
                {
                    paymentId,
                    mpStatus,
                    updatedAt: FieldValue.serverTimestamp()
                },
                { merge: true }
            );
            return;
        }

        const items = Array.isArray(o.items) ? o.items : [];

        for (const item of items) {
            const pid = item.id || item.productId;
            if (!pid) {
                console.warn('[Webhook] Ítem sin id de producto — sin decremento:', item.title || '?');
                continue;
            }
            const pref = db.collection('products').doc(pid);
            const psnap = await tx.get(pref);
            if (!psnap.exists) {
                console.warn('[Webhook] Producto no existe:', pid);
                continue;
            }
            const pdata = psnap.data();
            const { variants, sizes, stock } = applyStockDecrement(
                pdata,
                item.quantity,
                item.variantColor,
                item.variantSize
            );
            tx.update(pref, {
                variants,
                sizes,
                stock,
                updatedAt: FieldValue.serverTimestamp()
            });
        }

        if (o.status === 'paid' && !o.inventoryAdjusted) {
            tx.set(
                orderRef,
                {
                    inventoryAdjusted: true,
                    paymentId,
                    mpStatus,
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
                paymentId,
                paidAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                mpStatus,
                inventoryAdjusted: true
            },
            { merge: true }
        );
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
    if (!(await applyRateLimit(req, res, 'public-default'))) return;

    try {
        const { type, data } = req.body || {};

        if (type === 'payment' && data?.id) {
            const xSignature = req.headers['x-signature'] || '';
            const xRequestId = req.headers['x-request-id'] || '';

            if (!verifyMpSignature(xSignature, xRequestId, data.id)) {
                console.error('[Webhook] Firma inválida — solicitud rechazada');
                return res.status(200).json({ received: true });
            }
        }

        if (type === 'payment' && data?.id) {
            const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
            const payment = new Payment(client);
            const paymentInfo = await payment.get({ id: data.id });
            const orderId = paymentInfo.external_reference;

            if (orderId) {
                const db = initAdmin();
                const orderRef = db.collection('orders').doc(orderId);
                const nextStatus = mapStatus(paymentInfo.status);

                if (nextStatus === 'paid') {
                    const prePaidSnap = await orderRef.get();
                    const skipConfirmationEmails =
                        prePaidSnap.exists && prePaidSnap.data().inventoryAdjusted === true;

                    await applyPaidTransition(db, orderRef, paymentInfo);

                    if (skipConfirmationEmails) {
                        return res.status(200).json({ received: true });
                    }

                    const orderSnapAfterPaid = await orderRef.get();
                    if (!orderSnapAfterPaid.exists) {
                        console.warn(
                            `[Webhook] Pago MP ${paymentInfo.id} aprobado con external_reference "${orderId}" pero no hay documento en orders — probable cobro fuera del checkout VOLT o referencia incorrecta. No se envían mails ni WhatsApp.`
                        );
                        return res.status(200).json({ received: true });
                    }

                    try {
                        if (!process.env.RESEND_API_KEY) {
                            throw new Error('RESEND_API_KEY no configurada');
                        }

                        const orderSnap = orderSnapAfterPaid;
                        const orderData = orderSnap.data();
                        const customer = orderData.customer || {};
                        const items = Array.isArray(orderData.items) ? orderData.items : [];
                        const total = Number(orderData.total || 0);
                        const customerName = customer.name || 'Cliente VOLT';
                        const customerEmail = customer.email || null;

                        if (!customerEmail) {
                            throw new Error(`No hay email del cliente para orden ${orderId}`);
                        }

                        const itemsHtml = items.length
                            ? items.map((item) => formatItemLineHtml(item)).join('')
                            : '<li>Sin detalle de productos</li>';
                        const shippingHtml = formatShippingBlockClientHtml(orderData);

                        const resend = new Resend(process.env.RESEND_API_KEY);
                        await resend.emails.send({
                            from: 'VOLT Store <noreply@voltculture.com.ar>',
                            to: customerEmail,
                            subject: `Tu pedido VOLT #${orderId} fue confirmado ✅`,
                            html: `
                                <div style="background:#0b0b0b;color:#f2f2f2;padding:24px;font-family:Arial,Helvetica,sans-serif;line-height:1.5;">
                                    <h1 style="margin:0 0 12px 0;color:#c1121f;font-size:22px;">Pago confirmado</h1>
                                    <p style="margin:0 0 12px 0;">Hola ${escapeHtmlAttr(customerName)}, tu pedido fue confirmado.</p>
                                    <p style="margin:0 0 8px 0;"><strong>Numero de orden:</strong> ${escapeHtmlAttr(orderId)}</p>
                                    <p style="margin:0 0 16px 0;"><strong>Total:</strong> $${total.toLocaleString('es-AR')}</p>
                                    <h2 style="margin:0 0 8px 0;color:#c1121f;font-size:18px;">Envío</h2>
                                    ${shippingHtml}
                                    <h2 style="margin:0 0 8px 0;color:#c1121f;font-size:18px;">Productos</h2>
                                    <ul style="margin:0 0 16px 18px;padding:0;">${itemsHtml}</ul>
                                    <p style="margin:0;color:#bdbdbd;font-size:12px;">Gracias por comprar en VOLT Store.</p>
                                </div>
                            `
                        });
                    } catch (mailError) {
                        console.error('Error enviando email de confirmación al cliente:', mailError.message);
                    }

                    try {
                        if (!process.env.RESEND_API_KEY) {
                            throw new Error('RESEND_API_KEY no configurada');
                        }

                        const orderData = orderSnapAfterPaid.data();
                        const customer = orderData.customer || {};
                        const items = Array.isArray(orderData.items) ? orderData.items : [];
                        const total = Number(orderData.total || 0);
                        const itemsHtml = items.length
                            ? items.map((item) => formatItemLineHtml(item)).join('')
                            : '<li>Sin detalle de productos</li>';
                        const shippingAdminHtml = formatShippingBlockAdminHtml(orderData);

                        const resend = new Resend(process.env.RESEND_API_KEY);
                        await resend.emails.send({
                            from: 'VOLT Store <noreply@voltculture.com.ar>',
                            to: ADMIN_SALE_EMAIL,
                            subject: `🏁 Nueva venta VOLT — Orden #${orderId}`,
                            html: `
                                <div style="background:#0b0b0b;color:#f2f2f2;padding:24px;font-family:Arial,Helvetica,sans-serif;line-height:1.5;">
                                    <h1 style="margin:0 0 12px 0;color:#c1121f;font-size:22px;">Nueva venta confirmada</h1>
                                    <p style="margin:0 0 8px 0;"><strong>Orden:</strong> ${escapeHtmlAttr(orderId)}</p>
                                    <p style="margin:0 0 8px 0;"><strong>Cliente:</strong> ${escapeHtmlAttr(customer.name || '-')}</p>
                                    <p style="margin:0 0 8px 0;"><strong>Email:</strong> ${escapeHtmlAttr(customer.email || '-')}</p>
                                    <p style="margin:0 0 8px 0;"><strong>Teléfono:</strong> ${escapeHtmlAttr(customer.phone || '-')}</p>
                                    <p style="margin:0 0 16px 0;"><strong>Total:</strong> $${total.toLocaleString('es-AR')}</p>
                                    <h2 style="margin:0 0 8px 0;color:#c1121f;font-size:18px;">Envío</h2>
                                    ${shippingAdminHtml}
                                    <h2 style="margin:0 0 8px 0;color:#c1121f;font-size:18px;">Productos</h2>
                                    <ul style="margin:0 0 16px 18px;padding:0;">${itemsHtml}</ul>
                                    <p style="margin:0;color:#888;font-size:12px;">VOLT — voltculture.com.ar</p>
                                </div>
                            `
                        });
                    } catch (adminMailError) {
                        console.error('Error enviando email de venta al admin:', adminMailError.message);
                    }

                    try {
                        await sendAdminWhatsApp(orderSnapAfterPaid.data());
                    } catch (waError) {
                        console.error('Error enviando WhatsApp al admin:', waError.message);
                    }
                } else {
                    const currentSnap = await orderRef.get();
                    const currentStatus = currentSnap.exists ? currentSnap.data().status : null;
                    const currentPriority = STATUS_PRIORITY[currentStatus] ?? -1;
                    const nextPriority = STATUS_PRIORITY[nextStatus] ?? -1;

                    if (nextPriority <= currentPriority) {
                        console.log(
                            `[Webhook] Orden ${orderId}: estado actual '${currentStatus}' es más avanzado que '${nextStatus}' — no se sobrescribe`
                        );
                        return res.status(200).json({ received: true });
                    }

                    const payload = {
                        status: nextStatus,
                        paymentId: String(paymentInfo.id),
                        updatedAt: FieldValue.serverTimestamp(),
                        mpStatus: paymentInfo.status
                    };
                    await orderRef.set(payload, { merge: true });
                }
            }
        }
    } catch (error) {
        console.error('Webhook error (respondiendo 200):', error.message);
    }

    return res.status(200).json({ received: true });
}
