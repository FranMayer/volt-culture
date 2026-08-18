/**
 * Tests unitarios de lib/checkout.js (helpers puros portados de
 * legacy/js/pagos.js). Uso: node tests/checkout-logic.test.mjs
 */
import {
    validateDni,
    formatMoney,
    estimateCartShipment,
    validateAndreaniAddress,
    checkCoupon,
    computeCheckoutTotals,
    buildTransferWaMessage,
} from '../lib/checkout.js';

let failed = 0;
function check(label, cond) {
    if (!cond) { console.error(`FAIL — ${label}`); failed++; }
}

const SHIPPING_CONFIG = {
    cordoba: { label: 'Córdoba Capital', cost: 2500, note: null },
    andreani: { label: 'Andreani / Interior', cost: 0, note: 'A coordinar' },
};

// ── validateDni (criterio de aceptación: bloquea el avance del checkout) ──
check('DNI 7 dígitos válido', validateDni('1234567') === true);
check('DNI 8 dígitos válido', validateDni('12345678') === true);
check('DNI 6 dígitos inválido', validateDni('123456') === false);
check('DNI 9 dígitos inválido', validateDni('123456789') === false);
check('DNI con puntos inválido', validateDni('12.345.678') === false);
check('DNI con letras inválido', validateDni('1234567a') === false);
check('DNI vacío inválido', validateDni('') === false);
check('DNI con espacios se trimea', validateDni('  1234567  ') === true);

// ── formatMoney ──
check('formatMoney formatea es-AR', formatMoney(2500) === '$2.500');
check('formatMoney redondea negativo/undefined a 0', formatMoney(undefined) === '$0');

// ── estimateCartShipment ──
{
    const r1 = estimateCartShipment([{ title: 'Remera VOLT', quantity: 2 }]);
    check('remera: 0.3kg/u, 3000cm3/u', r1.pesoKg === 0.6 && r1.volumenCm3 === 6000);
    const r2 = estimateCartShipment([{ title: 'Hoodie VOLT', quantity: 1 }, { title: 'Buzo Canguro', quantity: 1 }]);
    check('hoodie/buzo: 0.7kg/u, 6000cm3/u', r2.pesoKg === 1.4 && r2.volumenCm3 === 12000);
    check('carrito vacío -> 0/0', estimateCartShipment([]).pesoKg === 0);
}

// ── validateAndreaniAddress ──
check('dirección completa válida', validateAndreaniAddress({ street: 'Calle 1', city: 'Cba', province: 'Córdoba', postalCode: '5000' }) === null);
check('falta calle bloquea', validateAndreaniAddress({ city: 'Cba', province: 'Córdoba', postalCode: '5000' }) !== null);
check('falta CP bloquea', validateAndreaniAddress({ street: 'Calle 1', city: 'Cba', province: 'Córdoba' }) !== null);

// ── checkCoupon (mensajes en español, reusa lib/server/coupons.js) ──
check('cupón activo válido', checkCoupon({ active: true, percent: 20 }).valid === true);
check('cupón inexistente -> mensaje ES', checkCoupon(null).reason === 'No encontramos ese cupón.');
check('cupón inactivo -> mensaje ES', checkCoupon({ active: false, percent: 20 }).reason === 'Ese cupón no está activo.');
check('cupón vencido -> mensaje ES', checkCoupon({ active: true, percent: 20, expiresAt: new Date(Date.now() - 1000) }).reason === 'Ese cupón está vencido.');

// ── computeCheckoutTotals (paso 3: MP / transferencia -10% / cupón) ──
const items = [{ price: 10000, quantity: 1 }, { price: 5000, quantity: 2 }]; // productsTotal = 20000
{
    // MP, Córdoba, sin cupón: total = productos + envío
    const t = computeCheckoutTotals(items, 'cordoba', SHIPPING_CONFIG, 'mp', null);
    check('mp sin cupón: subtotal = productos + envío', t.subtotal === 22500);
    check('mp sin cupón: sin descuento', t.discountAmount === 0);
    check('mp sin cupón: total = subtotal', t.total === 22500);
}
{
    // Transferencia, Andreani (shippingCost=0), sin cupón: -10% sobre subtotal
    const t = computeCheckoutTotals(items, 'andreani', SHIPPING_CONFIG, 'transfer', null);
    check('transfer sin cupón: shippingCost andreani = 0', t.shippingCost === 0);
    check('transfer sin cupón: descuento 10% de 20000 = 2000', t.discountAmount === 2000);
    check('transfer sin cupón: total = 18000', t.total === 18000);
}
{
    // Cupón reemplaza el -10% en transferencia (descuento sobre productos, no subtotal)
    const t = computeCheckoutTotals(items, 'cordoba', SHIPPING_CONFIG, 'transfer', { code: 'VOLT20', percent: 20 });
    check('transfer con cupón 20%: descuento = 20% de productos (4000)', t.discountAmount === 4000);
    check('transfer con cupón: total = subtotal - descuento', t.total === t.subtotal - 4000);
}
{
    // MP con cupón: descuento por redondeo por-ítem (igual a create-preference.js)
    const t = computeCheckoutTotals(items, 'cordoba', SHIPPING_CONFIG, 'mp', { code: 'VOLT10', percent: 10 });
    // unitPrice item1: round(10000*0.9)=9000; item2: round(5000*0.9)=4500*2=9000 -> discountedProductsTotal=18000
    check('mp con cupón 10%: descuento = 20000-18000 = 2000', t.discountAmount === 2000);
}

// ── buildTransferWaMessage ──
{
    const msg = buildTransferWaMessage({
        items,
        customer: { name: 'Juan Pérez', dni: '12345678', phone: '3511234567', email: 'juan@test.com' },
        shippingOption: 'cordoba',
        shippingConfig: SHIPPING_CONFIG,
        serverTotals: { orderId: 'VOLT-ABC123', subtotal: 22500, discountAmount: 2250, total: 20250, discountSource: 'transfer' },
    });
    check('mensaje WA incluye el orderId', msg.includes('VOLT-ABC123'));
    check('mensaje WA incluye el total final', msg.includes('$20.250'));
    check('mensaje WA incluye datos del cliente', msg.includes('DNI 12345678'));
    check('mensaje WA marca descuento transferencia (no cupón)', msg.includes('Descuento 10% transferencia'));

    const msgCoupon = buildTransferWaMessage({
        items,
        customer: { name: 'Ana', dni: '87654321', phone: '351', email: 'a@a.com' },
        shippingOption: 'andreani',
        shippingConfig: SHIPPING_CONFIG,
        address: { street: 'Calle 1', city: 'Cba', province: 'Córdoba', postalCode: '5000' },
        serverTotals: { orderId: 'VOLT-XYZ', subtotal: 20000, discountAmount: 4000, total: 16000, discountSource: 'coupon', coupon: 'VOLT20', discountPercent: 20 },
    });
    check('mensaje WA con cupón menciona el código', msgCoupon.includes('cupón VOLT20'));
    check('mensaje WA andreani incluye la dirección', msgCoupon.includes('Cba') && msgCoupon.includes('5000'));
}

// ── promo 2x1 en los totales del resumen ───────────────────────────────────
const SHIP = { cordoba: { cost: 3000 }, andreani: { cost: 0 } };
const buzoPromo = (price, quantity = 1) => ({
    id: `b${price}`, title: 'Buzo TC', price, quantity, promo2x1: true,
});

// 2 buzos de 45000, envío 0, pago MP, sin cupón.
const t1 = computeCheckoutTotals(
    [buzoPromo(45000), buzoPromo(45000)], 'andreani', SHIP, 'mp', null);
check('2x1 descuenta el más barato del par', t1.promoDiscount === 45000);
check('2x1 en MP: total = 45000', t1.total === 45000);

// Mismo carrito por transferencia: el 10% corre sobre el subtotal YA con 2x1.
const t2 = computeCheckoutTotals(
    [buzoPromo(45000), buzoPromo(45000)], 'andreani', SHIP, 'transfer', null);
check('2x1 + transferencia: promo intacta', t2.promoDiscount === 45000);
check('2x1 + transferencia: 10% sobre 45000 = 4500 → total 40500', t2.total === 40500);
check('2x1 + transferencia: discountAmount suma los dos', t2.discountAmount === 49500);

// Con envío: 2 buzos 45000 + envío 3000 → subtotal con promo 48000, −10% = 4800
const t3 = computeCheckoutTotals(
    [buzoPromo(45000), buzoPromo(45000)], 'cordoba', SHIP, 'transfer', null);
check('2x1 + envío + transferencia: total 43200', t3.total === 43200);

// Sin items en promo, el comportamiento viejo no cambia.
const t4 = computeCheckoutTotals(
    [{ id: 'x', title: 'Remera', price: 20000, quantity: 2 }], 'andreani', SHIP, 'transfer', null);
check('sin promo, transferencia sigue igual', t4.total === 36000);
check('sin promo, promoDiscount es 0', t4.promoDiscount === 0);

// Cupón + promo: el cupón se ignora (no acumulan).
const t5 = computeCheckoutTotals(
    [buzoPromo(45000), buzoPromo(45000)], 'andreani', SHIP, 'mp', { code: 'X', percent: 20 });
check('cupón no acumula con 2x1', t5.total === 45000);

// Un ÚNICO item en promo con quantity 1 no forma par: la promo no descuenta
// nada, así que el cupón tiene que aplicar igual. Bloquearlo por la sola
// presencia del flag mostraba $36.000 y cobraba $45.000.
const t6 = computeCheckoutTotals(
    [buzoPromo(45000)], 'andreani', SHIP, 'mp', { code: 'VOLT20', percent: 20 });
check('1 item en promo qty 1: la promo no descuenta', t6.promoDiscount === 0);
check('1 item en promo qty 1 + cupón 20%: el cupón SÍ se aplica', t6.discountAmount === 9000);
check('1 item en promo qty 1 + cupón 20%: total 36000', t6.total === 36000);

const t7 = computeCheckoutTotals(
    [buzoPromo(45000)], 'andreani', SHIP, 'transfer', { code: 'VOLT20', percent: 20 });
check('1 item en promo qty 1 + cupón por transferencia: cupón aplicado', t7.discountAmount === 9000);
check('1 item en promo qty 1 + cupón por transferencia: total 36000', t7.total === 36000);

// Sin cupón, ese mismo carrito sigue con el −10% de transferencia de siempre.
const t8 = computeCheckoutTotals([buzoPromo(45000)], 'andreani', SHIP, 'transfer', null);
check('1 item en promo qty 1 sin cupón: −10% transferencia intacto', t8.total === 40500);

// Con un par de verdad el cupón sí queda bloqueado.
const t9 = computeCheckoutTotals(
    [buzoPromo(45000, 2)], 'andreani', SHIP, 'mp', { code: 'VOLT20', percent: 20 });
check('con par real el cupón se ignora', t9.total === 45000 && t9.promoDiscount === 45000);

// ── WhatsApp: promo 2x1 + transferencia no debe atribuir todo el descuento al 10% ──
{
    // t2: promoDiscount=45000, discountAmount=49500 (promo + 10% transfer), total=40500
    const msgPromo = buildTransferWaMessage({
        items: [buzoPromo(45000), buzoPromo(45000)],
        customer: { name: 'Lu', dni: '11223344', phone: '351', email: 'lu@a.com' },
        shippingOption: 'andreani',
        shippingConfig: SHIP,
        address: { street: 'Calle 1', city: 'Cba', province: 'Córdoba', postalCode: '5000' },
        serverTotals: {
            orderId: 'VOLT-PROMO1',
            subtotal: t2.subtotal,
            discountAmount: t2.discountAmount,
            total: t2.total,
            discountSource: 'transfer',
            promoDiscount: t2.promoDiscount,
        },
    });
    check('mensaje WA promo: incluye línea Promo 2x1 con su monto', msgPromo.includes('*Promo 2x1:* −$45.000'));
    check('mensaje WA promo: línea transferencia muestra SOLO la porción del 10% (4500), no el combinado (49500)', msgPromo.includes('Descuento 10% transferencia:* −$4.500') && !msgPromo.includes('−$49.500'));
    check('mensaje WA promo: total final correcto', msgPromo.includes('$40.500'));
}

if (failed > 0) { console.error(`\n❌ ${failed} checkout logic checks failed`); process.exit(1); }
console.log('✅ checkout logic checks passed');
