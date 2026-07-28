/**
 * Tests unitarios del helper de WhatsApp al admin (WAHA).
 * Uso: node tests/whatsapp.test.mjs
 *
 * Cubre las dos cosas que pueden fallar en silencio y caro:
 *  - el parser de teléfono (un chatId mal armado le escribe a un desconocido)
 *  - el contrato del request contra WAHA (sesión, api key, path)
 * y que sendAdminWhatsApp jamás lance, que es su contrato con el webhook.
 *
 * El formato del mensaje NO se testea acá: lo arma buildAdminWhatsAppMessage
 * en pages/api/webhook.js, este módulo es solo transporte.
 */
import { createServer } from 'node:http';
import { toWhatsAppChatId, sendAdminWhatsApp } from '../lib/server/whatsapp.js';

let failed = 0;
function check(label, cond) {
    if (!cond) { console.error(`FAIL — ${label}`); failed++; }
}

// ── toWhatsAppChatId ────────────────────────────────────────────────────────
check('nacional 10 dígitos', toWhatsAppChatId('3511234567') === '5493511234567@c.us');
check('con 0 adelante', toWhatsAppChatId('03511234567') === '5493511234567@c.us');
check('con 0 y 15 troncal', toWhatsAppChatId('0351 15 1234567') === '5493511234567@c.us');
check('formato internacional +54 9', toWhatsAppChatId('+54 9 351 123 4567') === '5493511234567@c.us');
check('con 54 pero sin el 9', toWhatsAppChatId('543511234567') === '5493511234567@c.us');
check('ya normalizado', toWhatsAppChatId('5493511234567') === '5493511234567@c.us');
check('con guiones y paréntesis', toWhatsAppChatId('(0351) 123-4567') === '5493511234567@c.us');
check('prefijo 00 internacional', toWhatsAppChatId('005493511234567') === '5493511234567@c.us');
check('CABA con 15 (área de 2 dígitos)', toWhatsAppChatId('011 15 2345-6789') === '5491123456789@c.us');
check('vacío -> null', toWhatsAppChatId('') === null);
check('null -> null', toWhatsAppChatId(null) === null);
check('sin dígitos -> null', toWhatsAppChatId('no tengo') === null);
check('demasiado corto -> null', toWhatsAppChatId('1234') === null);
check('otro país se respeta', toWhatsAppChatId('+34 612 345 678') === '34612345678@c.us');

// ── sendAdminWhatsApp: el contrato es "nunca lanza" ─────────────────────────
const prevUrl = process.env.WAHA_URL;
const prevAdmin = process.env.ADMIN_WHATSAPP_NUMBER;
const TEXT = 'NUEVA VENTA VOLT\nOrden: #VOLT-ABC123';

process.env.ADMIN_WHATSAPP_NUMBER = '3511234567';

process.env.WAHA_URL = '';
check('sin WAHA_URL devuelve false', (await sendAdminWhatsApp(TEXT)) === false);

process.env.WAHA_URL = 'http://127.0.0.1:9'; // puerto muerto: connection refused
check('WAHA caído devuelve false sin lanzar', (await sendAdminWhatsApp(TEXT)) === false);

// Contrato del request contra WAHA, verificado a mano contra una instancia real
// (WAHA 2026.7.1, engine WEBJS) antes de fijarlo acá.
//
// El bug que esto previene: la sesión NO siempre se llama 'default'. WAHA le pone
// un id autogenerado (session_01kymv84...) cuando la creás desde el dashboard sin
// nombrarla, y mandar un nombre inexistente falla con 404 en CADA venta.
const captured = [];
const captureServer = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
        captured.push({ url: req.url, apiKey: req.headers['x-api-key'], body: JSON.parse(body || '{}') });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end('{"id":"fake"}');
    });
});
await new Promise((resolve) => captureServer.listen(0, '127.0.0.1', resolve));

const prevSession = process.env.WAHA_SESSION;
process.env.WAHA_URL = `http://127.0.0.1:${captureServer.address().port}`;
process.env.WAHA_API_KEY = 'test-key-123';

// WAHA_SESSION se lee al cargar el módulo, así que reimportamos con cache-bust
// para ejercitar el valor configurado en vez del que quedó fijado al inicio.
process.env.WAHA_SESSION = 'session_abc123';
const fresh = await import(`../lib/server/whatsapp.js?session-test=${Date.now()}`);
const sent = await fresh.sendAdminWhatsApp(TEXT);

captureServer.close();
if (prevSession === undefined) delete process.env.WAHA_SESSION;
else process.env.WAHA_SESSION = prevSession;
delete process.env.WAHA_API_KEY;

check('envío OK contra WAHA simulado', sent === true);
check('pega a /api/sendText', captured[0]?.url === '/api/sendText');
check('manda X-Api-Key', captured[0]?.apiKey === 'test-key-123');
check('usa la sesión configurada, no "default"', captured[0]?.body.session === 'session_abc123');
// El destino es el admin, NO el comprador: esta línea es la que atrapa una
// regresión que le mandaría el detalle de la venta al cliente.
check('chatId del admin', captured[0]?.body.chatId === '5493511234567@c.us');
check('manda el texto tal cual', captured[0]?.body.text === TEXT);

// El incidente de prod no fue un WAHA que rechaza (eso corta al instante) sino
// uno que ACEPTA y no contesta nunca: con el timeout viejo de 8s se comía el
// presupuesto de la función y el webhook timeouteaba. Este check falla si
// alguien vuelve a subir WAHA_TIMEOUT_MS.
const hangingServer = createServer(() => { /* nunca responde */ });
await new Promise((resolve) => hangingServer.listen(0, '127.0.0.1', resolve));
process.env.WAHA_URL = `http://127.0.0.1:${hangingServer.address().port}`;

const startedAt = Date.now();
const hangResult = await sendAdminWhatsApp(TEXT);
const elapsed = Date.now() - startedAt;
hangingServer.close();

check('WAHA que cuelga devuelve false', hangResult === false);
check(`WAHA que cuelga corta antes de 4s (tardó ${elapsed}ms)`, elapsed < 4000);

process.env.WAHA_URL = 'http://127.0.0.1:9';
check('texto vacío devuelve false', (await sendAdminWhatsApp('')) === false);
check('texto null devuelve false', (await sendAdminWhatsApp(null)) === false);

process.env.ADMIN_WHATSAPP_NUMBER = 'nope';
check('ADMIN_WHATSAPP_NUMBER inservible devuelve false', (await sendAdminWhatsApp(TEXT)) === false);

if (prevUrl === undefined) delete process.env.WAHA_URL;
else process.env.WAHA_URL = prevUrl;
if (prevAdmin === undefined) delete process.env.ADMIN_WHATSAPP_NUMBER;
else process.env.ADMIN_WHATSAPP_NUMBER = prevAdmin;

if (failed > 0) { console.error(`\n❌ ${failed} whatsapp helper checks failed`); process.exit(1); }
console.log('✅ whatsapp helper checks passed');
