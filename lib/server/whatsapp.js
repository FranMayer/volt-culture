/**
 * VOLT Store — aviso de venta al ADMIN por WhatsApp, vía WAHA.
 *
 * Reemplaza al viejo `sendAdminWhatsApp` de CallMeBot que vivía en
 * pages/api/webhook.js: mismo mensaje y mismo momento, pero sobre infra propia
 * en vez de un relay gratuito de terceros que hay que re-autorizar cuando se
 * cae. Al comprador se le avisa por mail (webhook.js), no por WhatsApp.
 *
 * Este módulo es SOLO transporte: el texto lo arma quien llama
 * (buildAdminWhatsAppMessage en pages/api/webhook.js, que ya tenía el formato
 * de venta con envío y productos). Duplicar acá un segundo formateador era
 * mantener dos versiones del mismo mensaje.
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

// El nombre de sesión NO siempre es 'default': WAHA autogenera ids del estilo
// `session_01kymv84...` cuando la creás desde el dashboard sin nombrarla, y
// mandar un nombre que no existe hace fallar el envío con 404 "Session not
// found". Configurable, con 'default' como fallback.
const WAHA_SESSION = (process.env.WAHA_SESSION || 'default').trim();

// WAHA autohospedado puede estar caído o inalcanzable desde la función
// serverless. Sin timeout, el webhook queda colgado hasta que MP corta y
// reintenta — justo lo que este módulo tiene que evitar.
//
// 2.5s, no 8s: el camino de pago ya encadena MP, 2x Firestore, la transacción
// y 2 mails antes de llegar acá. Con 8s un WAHA caído se comía casi todo el
// presupuesto de la función y la hacía timeoutear — que fue exactamente lo que
// pasó en prod. Un WhatsApp que no sale en 2.5s no vale un pago reintentado.
const WAHA_TIMEOUT_MS = 2500;

function plain(value) {
    return String(value ?? '').trim();
}

/**
 * Teléfono libre → chatId de WhatsApp (`<número>@c.us`).
 *
 * Normaliza en vez de concatenar: un chatId mal armado le escribe a un
 * desconocido. Hoy solo entra ADMIN_WHATSAPP_NUMBER, pero el env se carga a
 * mano y admite "+54 9 351...", "0351 15 123-4567" o "3511234567" igual.
 *
 * ponytail: heurística solo para Argentina (54 + 9 + 10 dígitos, sin el 15
 * troncal). Números que ya vienen con otro código de país se respetan tal
 * cual. Si algún día hay que avisarle a alguien afuera, esto se reemplaza por
 * libphonenumber-js.
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

/**
 * Manda el aviso de venta al admin vía WAHA.
 * Falla en silencio (loguea) — nunca rompe el flujo del webhook.
 *
 * @param {string} text mensaje ya formateado
 * @returns {Promise<boolean>} true si WAHA aceptó el mensaje
 */
export async function sendAdminWhatsApp(text) {
    try {
        const body = plain(text);
        if (!body) return false;

        const baseUrl = plain(process.env.WAHA_URL).replace(/\/+$/, '');
        if (!baseUrl) {
            console.warn('[WhatsApp] WAHA_URL no configurada — skip aviso de venta al admin');
            return false;
        }

        const chatId = toWhatsAppChatId(process.env.ADMIN_WHATSAPP_NUMBER);
        if (!chatId) {
            console.warn('[WhatsApp] ADMIN_WHATSAPP_NUMBER vacío o inservible — skip aviso de venta');
            return false;
        }

        const headers = { 'Content-Type': 'application/json' };
        const apiKey = plain(process.env.WAHA_API_KEY);
        if (apiKey) headers['X-Api-Key'] = apiKey;

        const response = await fetch(`${baseUrl}/api/sendText`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ session: WAHA_SESSION, chatId, text: body }),
            signal: AbortSignal.timeout(WAHA_TIMEOUT_MS)
        });

        if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            console.error(`[WhatsApp] WAHA respondió HTTP ${response.status}: ${errBody.slice(0, 300)}`);
            return false;
        }

        console.log('[WhatsApp] Aviso de venta enviado al admin');
        return true;
    } catch (error) {
        console.error('[WhatsApp] Falló el aviso al admin vía WAHA:', error.message);
        return false;
    }
}
