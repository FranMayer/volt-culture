/**
 * Tests de la promo 2x1. Uso: node tests/promo2x1.test.mjs
 * Regla: de cada par de unidades en promo, la más barata es gratis.
 */
import { computePromo2x1, tienePromo2x1, repartirDescuentoEnItems } from '../lib/promo2x1.js';

let failed = 0;
function check(label, cond) {
    if (!cond) { console.error(`FAIL — ${label}`); failed++; }
}

const buzo = (price, quantity = 1, promo = true) => ({
    id: `p${price}-${quantity}`, title: `Buzo ${price}`, price, quantity, promo2x1: promo,
});

// ── computePromo2x1 ────────────────────────────────────────────────────────
check('2 iguales → uno gratis',
    computePromo2x1([buzo(45000), buzo(45000)]).descuento === 45000);

check('1 solo → sin descuento',
    computePromo2x1([buzo(45000)]).descuento === 0);

// 45000, 45000, 38000 → ordenado desc, gratis el índice 1 → 45000
check('3 unidades → una gratis, el impar se paga',
    computePromo2x1([buzo(45000), buzo(45000), buzo(38000)]).descuento === 45000);

// 45000, 45000, 38000, 38000 → gratis índices 1 y 3 → 45000 + 38000
check('4 unidades precios mixtos → el más barato de cada par',
    computePromo2x1([buzo(45000), buzo(45000), buzo(38000), buzo(38000)]).descuento === 83000);

// Pares de precios DISTINTOS: sin esto, una regla invertida (regalar el más
// caro de cada par) pasaría todos los tests de arriba.
check('de un par con precios distintos, el gratis es el más barato',
    computePromo2x1([buzo(999), buzo(1)]).descuento === 1);
check('3 precios distintos → gratis el 2do más caro, el más barato se paga',
    computePromo2x1([buzo(50000), buzo(30000), buzo(10000)]).descuento === 30000);

check('quantity 2 en una línea cuenta como dos unidades',
    computePromo2x1([buzo(45000, 2)]).descuento === 45000);

check('items sin promo no descuentan',
    computePromo2x1([buzo(45000, 1, false), buzo(45000, 1, false)]).descuento === 0);

check('items normales no afectan a los de promo',
    computePromo2x1([buzo(45000), buzo(45000), buzo(90000, 1, false)]).descuento === 45000);

check('carrito vacío no rompe', computePromo2x1([]).descuento === 0);

check('cuenta las unidades gratis',
    computePromo2x1([buzo(45000), buzo(45000), buzo(38000), buzo(38000)]).unidadesGratis === 2);

// ── tienePromo2x1 ──────────────────────────────────────────────────────────
check('detecta un item en promo', tienePromo2x1([buzo(45000, 1, false), buzo(38000)]) === true);
check('sin items en promo', tienePromo2x1([buzo(45000, 1, false)]) === false);
check('carrito vacío', tienePromo2x1([]) === false);

// ── repartirDescuentoEnItems: EL INVARIANTE DE MERCADOPAGO ─────────────────
// La suma de lo que se le manda a MP tiene que dar exactamente
// productsTotal − descuento, o el cliente paga distinto de lo que vio.
function sumaItems(items) {
    return items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
}
function totalCrudo(items) {
    return items.reduce((s, i) => s + i.price * i.quantity, 0);
}

const casos = [
    [buzo(45000), buzo(45000)],
    [buzo(45000), buzo(45000), buzo(38000)],
    [buzo(45000, 3)],
    [buzo(33333), buzo(33333), buzo(33333)],
    [buzo(45000), buzo(38000), buzo(90000, 1, false)],
    [buzo(45000, 2), buzo(38000, 3)],
    [buzo(999), buzo(1)],
];

for (const [idx, items] of casos.entries()) {
    const { descuento } = computePromo2x1(items);
    const repartidos = repartirDescuentoEnItems(items, descuento);
    const esperado = totalCrudo(items) - descuento;
    check(`invariante MP caso ${idx}: suma === total`, sumaItems(repartidos) === esperado);
    check(`invariante MP caso ${idx}: sin precios negativos`, repartidos.every((i) => i.unitPrice >= 0));
    check(`invariante MP caso ${idx}: sin cantidades <= 0`, repartidos.every((i) => i.quantity > 0));
    check(`invariante MP caso ${idx}: enteros`, repartidos.every((i) => Number.isInteger(i.unitPrice)));
}

check('sin descuento, los precios quedan intactos',
    repartirDescuentoEnItems([buzo(45000, 1, false)], 0)[0].unitPrice === 45000);

if (failed) {
    console.error(`\n${failed} test(s) fallaron`);
    process.exit(1);
}
console.log('promo2x1: todos los tests OK');
