/**
 * Ejercita el fallback SAMPLE_PRODUCTS de lib/products.ts sin Firestore real:
 * importa lib/products-data.js directamente (plain JS, sin Firebase), que es
 * lo mismo que corre lib/products.ts cuando getFromFirestore() falla.
 * Uso: node tests/products.test.mjs
 */
import assert from 'node:assert/strict';
import { SAMPLE_PRODUCTS, normalizeProduct, getFromSample, sanitizeImageUrl, getProductImageFallback } from '../lib/products-data.js';

// ── getFromSample(): shape normalizado, todos activos, todos línea TC ──────
const all = getFromSample(null, null);
assert.equal(all.length, SAMPLE_PRODUCTS.length, 'devuelve los 9 productos de ejemplo (todos active:true)');
for (const p of all) {
    assert.equal(typeof p.stock, 'number', `${p.id}: stock normalizado a number`);
    assert.deepEqual(p.variants, [], `${p.id}: variants normalizado a []`);
    assert.deepEqual(p.sizes, [], `${p.id}: sizes normalizado a []`);
    assert.equal(p.line, 'TC', `${p.id}: line default TC (productos viejos sin campo line)`);
    assert.ok(Array.isArray(p.images) && p.images.length === 1, `${p.id}: images derivado de image`);
    assert.equal(p.images[0], p.image, `${p.id}: images[0] === image`);
}

// ── filtro por categoría ─────────────────────────────────────────────────
const remeras = getFromSample('Remeras', null);
assert.equal(remeras.length, SAMPLE_PRODUCTS.length, 'todos los sample son categoría Remeras');
assert.equal(getFromSample('Buzos', null).length, 0, 'categoría inexistente → []');

// ── filtro por línea (case-insensitive, todos default TC) ───────────────
assert.equal(getFromSample(null, 'tc').length, SAMPLE_PRODUCTS.length, 'line=tc matchea default TC');
assert.equal(getFromSample(null, 'F1').length, 0, 'line=F1 no matchea ningún sample');
assert.equal(getFromSample(null, 'all').length, SAMPLE_PRODUCTS.length, 'line=all no filtra');

// ── normalizeProduct: variantes/talles con defaults ──────────────────────
const withVariants = normalizeProduct({
    id: 'x', name: 'X', price: 100, stock: '5', category: 'Remeras', active: true,
    variants: [{ color: ' Negro ', stock: -3 }],
    sizes: [{ size: ' m ', stock: '7' }],
});
assert.equal(withVariants.stock, 5, 'stock string → number');
assert.deepEqual(withVariants.variants, [{ color: 'Negro', hex: '#44464c', stock: 0 }], 'stock negativo clamped a 0, hex default');
assert.deepEqual(withVariants.sizes, [{ size: 'M', stock: 7 }], 'size uppercased/trimmed');

// ── sanitizeImageUrl: fallback en vacío/null, Cloudinary optimizado, resto intacto ──
assert.equal(sanitizeImageUrl(null), getProductImageFallback());
assert.equal(sanitizeImageUrl(''), getProductImageFallback());
assert.equal(sanitizeImageUrl('  "https://example.com/a.jpg"  '), 'https://example.com/a.jpg', 'trimea comillas/espacios');
assert.equal(
    sanitizeImageUrl('https://res.cloudinary.com/demo/image/upload/v1/x.jpg'),
    'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_1000/v1/x.jpg',
    'inserta transform Cloudinary'
);

console.log('products.test.mjs: all assertions passed');
