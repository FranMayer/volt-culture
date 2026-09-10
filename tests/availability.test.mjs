/**
 * Tests unitarios de isAvailable/isSizeAvailable (lib/catalog-helpers.js).
 * Reemplaza a tests/stock.test.mjs (VOLT dejó el stock numérico por un flag
 * de disponibilidad, ver CLAUDE.md).
 * Uso: node tests/availability.test.mjs
 */
import assert from 'node:assert/strict';
import { isAvailable, isSizeAvailable } from '../lib/catalog-helpers.js';

// ── producto con `available` explícito ──────────────────────────────────
assert.equal(isAvailable({ available: true }), true, 'producto disponible, sin talle');
assert.equal(isAvailable({ available: false }), false, 'producto no disponible, sin talle');
// `available: false` manda aunque el stock legado diga lo contrario.
assert.equal(isAvailable({ available: false, stock: 10 }), false, '`available` explícito pisa el stock legado');

// ── producto viejo sin `available`: fallback al stock agregado ──────────
assert.equal(isAvailable({ stock: 5 }), true, 'sin available, stock plano > 0 -> disponible');
assert.equal(isAvailable({ stock: 0 }), false, 'sin available, stock plano 0 -> no disponible');
assert.equal(
    isAvailable({ variants: [{ color: 'Negro', stock: 3 }], sizes: [] }),
    true,
    'sin available, agrega stock de variantes'
);
assert.equal(
    isAvailable({ variants: [{ color: 'Negro', stock: 0 }], sizes: [{ size: 'M', stock: 4 }] }),
    true,
    'variantes en 0 -> cae a la suma de talles'
);
assert.equal(isAvailable({}), false, 'sin ningún dato -> no disponible');

// ── `stock` legado como string (Firestore/imports lo dejan así a veces) ──
assert.equal(isAvailable({ stock: '5' }), true, 'stock legado como string "5" -> disponible');
assert.equal(isAvailable({ stock: '0' }), false, 'stock legado como string "0" -> no disponible');
assert.equal(
    isAvailable({ available: true, sizes: [{ size: 'M', stock: '0' }] }, 'M'),
    false,
    'talle con stock legado como string "0" -> no disponible'
);

// ── talle puntual: `available` explícito ─────────────────────────────────
assert.equal(
    isAvailable({ available: true, sizes: [{ size: 'M', available: true }] }, 'M'),
    true,
    'producto y talle disponibles'
);
assert.equal(
    isAvailable({ available: true, sizes: [{ size: 'M', available: false }] }, 'M'),
    false,
    'producto disponible pero el talle puntual apagado'
);
// El producto manda primero: si no está disponible, ni se mira el talle.
assert.equal(
    isAvailable({ available: false, sizes: [{ size: 'M', available: true }] }, 'M'),
    false,
    'producto no disponible bloquea aunque el talle sí lo esté'
);

// ── talle viejo sin `available`: fallback a stock > 0 ────────────────────
assert.equal(
    isAvailable({ available: true, sizes: [{ size: 'M', stock: 0 }] }, 'M'),
    false,
    'talle sin available, stock 0 -> no disponible'
);
assert.equal(
    isAvailable({ available: true, sizes: [{ size: 'M', stock: 3 }] }, 'M'),
    true,
    'talle sin available, stock > 0 -> disponible'
);

// ── talle inexistente en sizes[]: no bloquea (no hay nada que chequear) ──
assert.equal(
    isAvailable({ available: true, sizes: [{ size: 'M', available: false }] }, 'XL'),
    true,
    'el talle pedido no está en sizes[] -> se ignora, manda el producto'
);

// ── match de talle case-insensitive: los endpoints pasan el doc crudo de
//    Firestore, que puede tener `size` en minúscula en docs viejos ─────────
assert.equal(
    isAvailable({ available: true, sizes: [{ size: 'm', available: false }] }, 'M'),
    false,
    'talle guardado en minúscula matchea contra el pedido en mayúscula'
);
assert.equal(
    isAvailable({ available: true, sizes: [{ size: 'M', available: false }] }, 'm'),
    false,
    'y al revés: talle pedido en minúscula matchea contra el guardado en mayúscula'
);

// ── isSizeAvailable en aislado (usado por los botones de talle en la UI) ──
assert.equal(isSizeAvailable({ size: 'M', available: true }), true);
assert.equal(isSizeAvailable({ size: 'M', available: false }), false);
assert.equal(isSizeAvailable({ size: 'M', stock: 2 }), true, 'sin available -> fallback a stock > 0');
assert.equal(isSizeAvailable({ size: 'M', stock: 0 }), false);
assert.equal(isSizeAvailable(null), true, 'sin talle -> no bloquea');

console.log('✅ availability checks passed');
