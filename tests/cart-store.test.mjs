/**
 * Tests unitarios de lib/cart/reducer.js (lógica pura detrás de
 * lib/cart/store.ts). Uso: node tests/cart-store.test.mjs
 * .js (no .ts), mismo motivo que tests/stock.test.mjs: se importa sin
 * loader TS. Cubre addItem/removeItem/setQty/clear, count/subtotal, y el
 * parseo del formato legacy de localStorage['cart'] (compatibilidad crítica
 * de F3, ver comentario en lib/cart/store.ts).
 */
import assert from 'node:assert/strict';
import { addItem, removeItem, setQty, cartCount, cartSubtotal, parseCartStorage } from '../lib/cart/reducer.js';

// ── addItem: nueva línea ──────────────────────────────────────────────────
let items = addItem([], { id: 'p1', title: 'Remera', price: 1000, quantity: 0, image: '/x.jpg' }, 2);
assert.equal(items.length, 1);
assert.equal(items[0].quantity, 2);

// ── addItem: mismo lineKey suma qty ──────────────────────────────────────
items = addItem(items, { id: 'p1', title: 'Remera', price: 1000, quantity: 0, image: '/x.jpg' }, 3);
assert.equal(items.length, 1, 'no duplica la línea');
assert.equal(items[0].quantity, 5, 'suma cantidades');

// ── addItem: mismo id, distinta variante = otra línea ────────────────────
items = addItem(items, { id: 'p1', title: 'Remera', price: 1000, quantity: 0, image: '/x.jpg', variantColor: 'negro' }, 1);
assert.equal(items.length, 2);

// ── setQty ────────────────────────────────────────────────────────────────
items = setQty(items, 'p1--', 10);
assert.equal(items.find((i) => i.id === 'p1' && !i.variantColor).quantity, 10);

// setQty <= 0 elimina la línea
items = setQty(items, 'p1-negro-', 0);
assert.equal(items.length, 1);

// ── removeItem ────────────────────────────────────────────────────────────
items = removeItem(items, 'p1--');
assert.equal(items.length, 0);

// ── count / subtotal ──────────────────────────────────────────────────────
items = addItem([], { id: 'a', title: 'A', price: 100, quantity: 0, image: '' }, 2);
items = addItem(items, { id: 'b', title: 'B', price: 250, quantity: 0, image: '' }, 3);
assert.equal(cartCount(items), 5);
assert.equal(cartSubtotal(items), 100 * 2 + 250 * 3);

// clear() en el store es simplemente set({items: []}) — nada que testear
// más allá de que el array vacío da count/subtotal en 0.
assert.equal(cartCount([]), 0);
assert.equal(cartSubtotal([]), 0);

// ── compatibilidad legacy: localStorage['cart'] como array raw ──────────
// Formato real de legacy/js/main.js:8 y cart-sync.js:27-33:
// `JSON.parse(localStorage.getItem('cart')) || []` (sin wrapper).
const legacyRaw = JSON.stringify([{ id: 'legacy1', title: 'Viejo', price: 500, quantity: 4, image: '/y.jpg' }]);
const parsedLegacy = parseCartStorage(legacyRaw);
assert.equal(parsedLegacy.length, 1);
assert.equal(parsedLegacy[0].id, 'legacy1');
assert.equal(parsedLegacy[0].quantity, 4);

// ── formato ya migrado por zustand/persist ({state:{items}, version}) ───
const zustandRaw = JSON.stringify({ state: { items: [{ id: 'z1', title: 'Z', price: 1, quantity: 1, image: '' }] }, version: 0 });
const parsedZustand = parseCartStorage(zustandRaw);
assert.equal(parsedZustand.length, 1);
assert.equal(parsedZustand[0].id, 'z1');

// ── sin valor / valor corrupto → null (persist arranca en []) ───────────
assert.equal(parseCartStorage(null), null);
assert.equal(parseCartStorage('not json'), null);

console.log('cart-store.test.mjs: all assertions passed');
