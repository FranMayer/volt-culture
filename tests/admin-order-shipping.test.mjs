/**
 * Tests unitarios de lib/admin/order-shipping.js. Uso: node tests/admin-order-shipping.test.mjs
 */
import { needsAddressShipping, buildShippingLines, shippingPlainText } from '../lib/admin/order-shipping.js';

let failed = 0;
function check(label, cond) {
    if (!cond) { console.error(`FAIL — ${label}`); failed++; }
}

// needsAddressShipping
check('type andreani necesita dirección', needsAddressShipping({ type: 'andreani' }) === true);
check('method correo necesita dirección', needsAddressShipping({ method: 'correo' }) === true);
check('method cadete no necesita dirección', needsAddressShipping({ method: 'cadete' }) === false);
check('type cordoba no necesita dirección', needsAddressShipping({ type: 'cordoba' }) === false);
check('sin shipping -> false', needsAddressShipping(undefined) === false);

// buildShippingLines — cordoba
const cordobaOrder = { shipping: { type: 'cordoba', cost: 1500 } };
const cordobaLines = buildShippingLines(cordobaOrder);
check('cordoba: primera línea es Envío', cordobaLines[0].label === 'Envío' && cordobaLines[0].text.includes('Córdoba Capital'));
check('cordoba: incluye costo', cordobaLines.some((l) => l.label === 'Costo envío' && l.text === '$1.500'));
check('cordoba: nota de coordinar WhatsApp', cordobaLines.some((l) => l.text.includes('coordinar por WhatsApp')));

// buildShippingLines — andreani con tracking
const andreaniOrder = {
    shipping: {
        type: 'andreani',
        address: { street: 'Av. Colón 1234', city: 'Córdoba', province: 'Córdoba', postalCode: '5000' },
        trackingNumber: 'AND123',
        carrier: 'Andreani',
    },
};
const andreaniLines = buildShippingLines(andreaniOrder);
check('andreani: incluye dirección', andreaniLines.some((l) => l.label === 'Dirección' && l.text === 'Av. Colón 1234'));
check('andreani: incluye ciudad/CP', andreaniLines.some((l) => l.text.includes('Córdoba, Córdoba') && l.text.includes('5000')));
const trackingLine = andreaniLines.find((l) => l.trackingUrl);
check('andreani: línea de tracking con URL', trackingLine && trackingLine.trackingUrl.includes('AND123'));

// buildShippingLines — pedido legado (sin type/method), con dirección plana
const legacyOrder = { customer: { address: 'Calle Falsa 123' } };
check('legado: usa customer.address', buildShippingLines(legacyOrder)[0].text === 'Calle Falsa 123');

// shippingPlainText — no debe tirar y debe contener el texto principal
check('plainText incluye la URL de tracking', shippingPlainText(andreaniOrder).includes('https://www.andreani.com'));
check('plainText cordoba no rompe', typeof shippingPlainText(cordobaOrder) === 'string');

if (failed > 0) { console.error(`\n❌ ${failed} admin-order-shipping checks failed`); process.exit(1); }
console.log('✅ admin-order-shipping checks passed');
