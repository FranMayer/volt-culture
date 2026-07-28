/**
 * VOLT Store — notificación de WhatsApp al COMPRADOR vía WAHA.
 *
 * Distinta de `sendAdminWhatsApp` (CallMeBot) que vive en pages/api/webhook.js:
 * esa avisa al admin de una venta nueva, esta le escribe al cliente.
 *
 * Vive en lib/server/ (no en lib/) porque lee secretos de entorno y solo se
 * llama desde endpoints serverless — la convención del repo para eso es
 * lib/server/ (ver CLAUDE.md). Nada de esto debe terminar en un bundle de
 * cliente.
 *
 * Contrato: NUNCA lanza. El webhook de Mercado Pago devuelve 500 ante una
 * excepción para que MP reintente; si WAHA se cae, un throw acá provocaría
 * reintentos de un pago que ya se procesó bien. Devuelve true/false.
 */

const WAHA_SESSION = 'default';

// WAHA autohospedado puede estar caído o inalcanzable desde la función
// serverless. Sin timeout, el webhook queda colgado hasta que MP corta y
// reintenta — justo lo que este módulo tiene que evitar.
const WAHA_TIMEOUT_MS = 8000;

function plain(value) {
    return String(value ?? '').trim();
}

/**
 * Teléfono libre → chatId de WhatsApp (`<número>@c.us`).
 *
 * El checkout solo valida que el teléfono no esté vacío
 * (CheckoutModal.tsx:222), así que acá llega texto libre: "0351 15 123-4567",
 * "+54 9 351...", "3511234567". Mandar a un chatId mal armado le escribe a un
 * desconocido, así que normalizamos en vez de concatenar.
 *
 * ponytail: heurística solo para Argentina (54 + 9 + 10 dígitos, sin el 15
 * troncal). Números que ya vienen con otro código de país se respetan tal
 * cual. Si algún día VOLT vende afuera, esto se reemplaza por libphonenumber-js.
 *
 * @returns {string|null} chatId, o null si el número no es usable.
 */
export function toWhatsAppChatId(phoneRaw) {
    let digits = plain(phoneRaw).replace(/\D/g, '');
    if (!digits) return null;

    if (digits.startsWith('00')) digits = digits.slice(2);

    // A nacional (sin 54, sin el 9 de móvil, sin el 0 troncal). El orden importa:
    // hay que pelar los prefijos ANTES de decidir si es argentino, si no un
    // "03511234567" (11 dígitos) o un "0351 15 1234567" (13) no matchean ninguna
    // longitud nacional y se escapan a la rama internacional.
    let national;
    if (digits.startsWith('54')) {
        national = digits.slice(2);
        if (national.startsWith('9')) national = national.slice(1);
    } else if (digits.startsWith('0')) {
        national = digits.replace(/^0+/, '');
    } else if (digits.length === 10 || digits.length === 12) {
        national = digits;
    } else {
        // Ya trae código de país propio: no le aplicamos reglas argentinas.
        return digits.length >= 8 ? `${digits}@c.us` : null;
    }

    // Sacar el 15 troncal: nacional válido son 10 dígitos (área 2-4 + abonado),
    // con 15 quedan 12. Solo lo removemos cuando el resultado da exactamente 10.
    if (national.length === 12) {
        for (const pos of [2, 3, 4]) {
            if (national.slice(pos, pos + 2) === '15') {
                national = national.slice(0, pos) + national.slice(pos + 2);
                break;
            }
        }
    }

    if (national.length !== 10) {
        console.warn(
            `[WhatsApp] Teléfono "${plain(phoneRaw)}" no queda en 10 dígitos nacionales (quedó ${national.length}) — no se envía`
        );
        return null;
    }

    return `549${national}@c.us`;
}

function formatItemsLines(items) {
    const arr = Array.isArray(items) ? items : [];
    if (arr.length === 0) return '- (sin detalle)';
    return arr
        .map((item) => {
            const title = plain(item.title || item.name) || 'Producto';
            const talle = plain(item.variantSize);
            const qty = Number(item.quantity || 1);
            return talle ? `- ${title} | Talle ${talle} | x${qty}` : `- ${title} | x${qty}`;
        })
        .join('\n');
}

/**
 * Línea del método de pago.
 *
 * Ojo: solo create-transfer-order.js escribe `paymentMethod: 'transfer'`;
 * las órdenes de Checkout Pro no guardan el campo. Por eso la tarjeta se
 * infiere por ausencia y no por un valor propio.
 *
 * Y el 10% de transferencia NO es fijo: un cupón válido lo reemplaza
 * (create-transfer-order.js:220-228). Anunciar "10% OFF" cuando en realidad
 * se aplicó un cupón sería informarle mal un monto al cliente, así que el
 * porcentaje sale del pedido.
 */
function formatPaymentLines(pedido) {
    const isTransfer = plain(pedido.paymentMethod) === 'transfer';
    if (!isTransfer) return ['💳 *Pago:* Tarjeta (Mercado Pago)'];

    const lines = ['🏦 *Pago:* Transferencia bancaria'];
    const percent = Number(pedido.discountPercent || 0);

    if (plain(pedido.discountSource) === 'coupon') {
        const coupon = plain(pedido.coupon);
        lines.push(
            `✅ Transferencia confirmada — cupón ${coupon || 'aplicado'}${percent ? ` (−${percent}% OFF)` : ''} ya aplicado.`
        );
    } else if (percent) {
        lines.push(`✅ Transferencia confirmada — ya te aplicamos el ${percent}% OFF.`);
    } else {
        lines.push('✅ Transferencia confirmada.');
    }
    return lines;
}

export function buildCustomerWhatsAppMessage(pedido) {
    const orderId = plain(pedido.orderId) || '(sin id)';
    const customer = pedido.customer || {};
    const name = plain(customer.name) || 'crack';
    const total = Number(pedido.total || 0);

    return [
        `🏁 ¡Gracias por tu compra, ${name}!`,
        '',
        `Tu pedido *#${orderId}* está confirmado y ya lo estamos preparando.`,
        '',
        '🛒 *Lo que pediste:*',
        formatItemsLines(pedido.items),
        '',
        ...formatPaymentLines(pedido),
        `💰 *Total: $${total.toLocaleString('es-AR')}*`,
        '',
        'Te escribimos por acá apenas salga el envío. Cualquier cosa, respondé este mensaje.',
        '',
        'VOLT — MotorSport Culture 🏎️'
    ].join('\n');
}

/**
 * Manda el WhatsApp de confirmación al comprador vía WAHA.
 * Falla en silencio (loguea) — nunca rompe el flujo del webhook.
 *
 * @param {object} pedido documento de la orden en Firestore
 * @returns {Promise<boolean>} true si WAHA aceptó el mensaje
 */
export async function sendWhatsAppNotification(pedido) {
    try {
        if (!pedido) return false;

        const baseUrl = plain(process.env.WAHA_URL).replace(/\/+$/, '');
        if (!baseUrl) {
            console.warn('[WhatsApp] WAHA_URL no configurada — skip notificación al comprador');
            return false;
        }

        const chatId = toWhatsAppChatId(pedido.customer?.phone);
        if (!chatId) {
            console.warn(
                `[WhatsApp] Orden ${plain(pedido.orderId) || '?'} sin teléfono usable — skip notificación al comprador`
            );
            return false;
        }

        const headers = { 'Content-Type': 'application/json' };
        const apiKey = plain(process.env.WAHA_API_KEY);
        if (apiKey) headers['X-Api-Key'] = apiKey;

        const response = await fetch(`${baseUrl}/api/sendText`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                session: WAHA_SESSION,
                chatId,
                text: buildCustomerWhatsAppMessage(pedido)
            }),
            signal: AbortSignal.timeout(WAHA_TIMEOUT_MS)
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            console.error(`[WhatsApp] WAHA respondió HTTP ${response.status}: ${body.slice(0, 300)}`);
            return false;
        }

        console.log(`[WhatsApp] Confirmación enviada al comprador de la orden ${plain(pedido.orderId) || '?'}`);
        return true;
    } catch (error) {
        console.error('[WhatsApp] Falló el envío al comprador vía WAHA:', error.message);
        return false;
    }
}
