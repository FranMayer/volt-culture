/**
 * Tests unitarios del helper de WhatsApp al comprador (WAHA).
 * Uso: node tests/whatsapp.test.mjs
 *
 * Cubre las dos partes que pueden fallar en silencio y caro:
 *  - el parser de teléfono (un chatId mal armado le escribe a un desconocido)
 *  - las líneas de pago/descuento (informarle mal el monto al cliente)
 * y que sendWhatsAppNotification jamás lance, que es su contrato con el webhook.
 */
import {
    toWhatsAppChatId,
    buildCustomerWhatsAppMessage,
    sendWhatsAppNotification
} from '../lib/server/whatsapp.js';

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

// ── buildCustomerWhatsAppMessage ────────────────────────────────────────────
const baseOrder = {
    orderId: 'VOLT-ABC123',
    customer: { name: 'Franco', phone: '3511234567' },
    items: [
        { title: 'Remera Paddock', variantSize: 'M', quantity: 2 },
        { title: 'Buzo Pitlane', variantSize: 'L', quantity: 1 }
    ],
    total: 85000
};

const card = buildCustomerWhatsAppMessage(baseOrder);
check('incluye el nombre', card.includes('Franco'));
check('incluye el id de orden', card.includes('VOLT-ABC123'));
check('incluye producto + talle + cantidad', card.includes('Remera Paddock | Talle M | x2'));
check('incluye el segundo producto', card.includes('Buzo Pitlane | Talle L | x1'));
check('incluye total formateado', card.includes('85.000'));
check('tarjeta cuando no hay paymentMethod', card.includes('Tarjeta'));
check('tarjeta NO promete transferencia', !card.includes('Transferencia confirmada'));
check('firma de marca', card.includes('VOLT — MotorSport Culture'));

const transfer = buildCustomerWhatsAppMessage({
    ...baseOrder,
    paymentMethod: 'transfer',
    discountSource: 'transfer',
    discountPercent: 10
});
check('transferencia confirmada', transfer.includes('Transferencia confirmada'));
check('transferencia anuncia 10% OFF', transfer.includes('10% OFF'));

// El cupón REEMPLAZA al 10% (create-transfer-order.js): anunciar 10% acá
// sería informarle mal el descuento al cliente.
const withCoupon = buildCustomerWhatsAppMessage({
    ...baseOrder,
    paymentMethod: 'transfer',
    discountSource: 'coupon',
    coupon: 'VOLT20',
    discountPercent: 20
});
check('cupón nombrado', withCoupon.includes('VOLT20'));
check('cupón usa su propio porcentaje', withCoupon.includes('20% OFF'));
check('cupón NO miente con el 10%', !withCoupon.includes('10% OFF'));

// Pedido degradado: no debe explotar ni imprimir "undefined"
const bare = buildCustomerWhatsAppMessage({ orderId: 'X1', customer: {}, items: [], total: 0 });
check('sin items no rompe', bare.includes('(sin detalle)'));
check('sin datos no imprime undefined', !bare.includes('undefined'));

// Ítem sin talle (producto sin variantes)
const noSize = buildCustomerWhatsAppMessage({
    ...baseOrder,
    items: [{ title: 'Gorra Box', quantity: 1 }]
});
check('ítem sin talle omite el campo', noSize.includes('- Gorra Box | x1'));

// ── sendWhatsAppNotification: el contrato es "nunca lanza" ──────────────────
const prevUrl = process.env.WAHA_URL;

process.env.WAHA_URL = '';
check('sin WAHA_URL devuelve false', (await sendWhatsAppNotification(baseOrder)) === false);

process.env.WAHA_URL = 'http://127.0.0.1:9'; // puerto muerto: connection refused
check('WAHA caído devuelve false sin lanzar', (await sendWhatsAppNotification(baseOrder)) === false);

check('pedido null devuelve false', (await sendWhatsAppNotification(null)) === false);
check(
    'teléfono inservible devuelve false',
    (await sendWhatsAppNotification({ ...baseOrder, customer: { name: 'X', phone: 'nope' } })) === false
);

if (prevUrl === undefined) delete process.env.WAHA_URL;
else process.env.WAHA_URL = prevUrl;

if (failed > 0) { console.error(`\n❌ ${failed} whatsapp helper checks failed`); process.exit(1); }
console.log('✅ whatsapp helper checks passed');
