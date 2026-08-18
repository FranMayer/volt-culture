/**
 * Tests de la promo 2x1. Uso: node tests/promo2x1.test.mjs
 * Regla: de cada par de unidades en promo, la más barata es gratis.
 */
import { readFileSync } from 'node:fs';
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

// ── Cantidades no enteras: el agujero de seguridad ─────────────────────────
// quantity 1.01 expandía DOS unidades (el loop `n < qty` corre en n=0 y n=1) y
// regalaba una entera: se pagaba $405 por un buzo de $45.000. La cantidad se
// pisa a entero dentro del módulo, no solo en los endpoints.
check('quantity 1.01 no forma par (una sola unidad)',
    computePromo2x1([buzo(45000, 1.01)]).descuento === 0);
check('quantity 1.01 cuenta 1 unidad, no 2',
    computePromo2x1([buzo(45000, 1.01)]).unidadesEnPromo === 1);
check('quantity 2.9 se trunca a 2 (un solo par)',
    computePromo2x1([buzo(45000, 2.9)]).descuento === 45000);
check('quantity 0.5 no aporta unidades',
    computePromo2x1([buzo(45000, 0.5)]).unidadesEnPromo === 0);
check('quantity 0 no aporta unidades',
    computePromo2x1([buzo(45000, 0)]).unidadesEnPromo === 0);
check('quantity negativa no aporta unidades',
    computePromo2x1([buzo(45000, -3)]).unidadesEnPromo === 0);
check('quantity NaN no aporta unidades',
    computePromo2x1([buzo(45000, NaN)]).unidadesEnPromo === 0);
check('quantity ausente no aporta unidades',
    computePromo2x1([{ id: 'x', price: 45000, promo2x1: true }]).unidadesEnPromo === 0);
check('quantity string "2" cuenta dos unidades',
    computePromo2x1([buzo(45000, '2')]).descuento === 45000);
check('quantity string "2.7" se trunca a 2',
    computePromo2x1([buzo(45000, '2.7')]).descuento === 45000);
check('quantity Infinity no cuelga el loop',
    computePromo2x1([buzo(45000, Infinity)]).unidadesEnPromo === 0);

// Los dos endpoints normalizan la cantidad ANTES de llegar acá: si alguien
// saca esa coerción, el body del cliente vuelve a mandar fraccionarios.
const normalizarQty = (q) => Math.max(1, Math.floor(Number(q)) || 1);
for (const [entrada, esperado] of [[1.01, 1], [0.5, 1], [0, 1], [-3, 1], [NaN, 1], ['2', 2], [undefined, 1], [2.9, 2]]) {
    const got = normalizarQty(entrada);
    check(`coerción de cantidad del endpoint: ${String(entrada)} → ${esperado}`,
        got === esperado && Number.isInteger(got) && got >= 1);
}
for (const archivo of ['../pages/api/create-preference.js', '../pages/api/create-transfer-order.js']) {
    const src = readFileSync(new URL(archivo, import.meta.url), 'utf8');
    check(`${archivo} sigue coercionando la cantidad a entero`,
        src.includes('Math.max(1, Math.floor(Number(item.quantity)) || 1)'));
}

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
