/**
 * Test unitario de lib/cart/reducer.js#mergeCartItems — transcripción de
 * merge() en legacy/js/cart-sync.js:42-59 (usada por lib/cart/sync.ts#loadAndMerge,
 * el merge que corre al loguearse). Uso: node tests/cart-merge.test.mjs
 */
import assert from 'node:assert/strict';
import { mergeCartItems } from '../lib/cart/reducer.js';

// ── solo local (Firestore vacío, sesión anónima previa con items) ────────
let merged = mergeCartItems([], [{ id: 'p1', title: 'Remera', price: 1000, quantity: 2, image: '/x.jpg' }]);
assert.equal(merged.length, 1);
assert.equal(merged[0].quantity, 2, 'item que solo existe en local se agrega tal cual');

// ── solo remoto (Firestore tiene items, local vacío) ──────────────────────
merged = mergeCartItems([{ id: 'p1', title: 'Remera', price: 1000, quantity: 3, image: '/x.jpg' }], []);
assert.equal(merged.length, 1);
assert.equal(merged[0].quantity, 3, 'item que solo existe en Firestore se conserva tal cual');

// ── misma línea en ambos, remoto > local → gana el mayor (Math.max, no suma) ─
merged = mergeCartItems(
    [{ id: 'p1', title: 'Remera', price: 1000, quantity: 5, image: '/x.jpg' }],
    [{ id: 'p1', title: 'Remera', price: 1000, quantity: 2, image: '/x.jpg' }]
);
assert.equal(merged.length, 1, 'no duplica la línea');
assert.equal(merged[0].quantity, 5, 'gana la cantidad remota (mayor)');

// ── misma línea en ambos, local > remoto → gana el mayor ──────────────────
merged = mergeCartItems(
    [{ id: 'p1', title: 'Remera', price: 1000, quantity: 1, image: '/x.jpg' }],
    [{ id: 'p1', title: 'Remera', price: 1000, quantity: 4, image: '/x.jpg' }]
);
assert.equal(merged.length, 1);
assert.equal(merged[0].quantity, 4, 'gana la cantidad local (mayor)');

// ── misma línea en ambos, cantidades iguales (ej: refresh sin cambios) ────
merged = mergeCartItems(
    [{ id: 'p1', title: 'Remera', price: 1000, quantity: 2, image: '/x.jpg' }],
    [{ id: 'p1', title: 'Remera', price: 1000, quantity: 2, image: '/x.jpg' }]
);
assert.equal(merged.length, 1);
assert.equal(merged[0].quantity, 2, 'no duplica cantidades cuando ya están sincronizados');

// ── distinta variante (mismo id, distinto color/talle) = línea separada ──
merged = mergeCartItems(
    [{ id: 'p1', title: 'Remera', price: 1000, quantity: 2, image: '/x.jpg', variantColor: 'negro' }],
    [{ id: 'p1', title: 'Remera', price: 1000, quantity: 1, image: '/x.jpg', variantColor: 'blanco' }]
);
assert.equal(merged.length, 2, 'lineKey distinto por variante -> líneas separadas, no mergea');

// ── mix realista: local tiene 2 items, uno coincide con Firestore, otro es nuevo ─
merged = mergeCartItems(
    [
        { id: 'a', title: 'A', price: 100, quantity: 1, image: '' },
        { id: 'b', title: 'B', price: 200, quantity: 5, image: '' },
    ],
    [
        { id: 'a', title: 'A', price: 100, quantity: 3, image: '' }, // coincide -> max(1,3)=3
        { id: 'c', title: 'C', price: 300, quantity: 1, image: '' }, // nuevo -> se agrega
    ]
);
assert.equal(merged.length, 3);
assert.equal(merged.find((i) => i.id === 'a').quantity, 3);
assert.equal(merged.find((i) => i.id === 'b').quantity, 5);
assert.equal(merged.find((i) => i.id === 'c').quantity, 1);

console.log('cart-merge.test.mjs: all assertions passed');
