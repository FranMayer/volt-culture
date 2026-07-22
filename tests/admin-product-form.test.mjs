/**
 * Ejercita lib/admin/product-form.js (lógica pura del form de producto del
 * panel admin) sin React ni Firestore. Uso: node tests/admin-product-form.test.mjs
 */
import assert from 'node:assert/strict';
import {
    normalizeVariants,
    normalizeSizes,
    normalizeImageUrls,
    computeStock,
    validateVariantsAndSizes,
    validateImages,
    buildProductPayload,
    validateRequiredFields,
    diffChangedFields,
} from '../lib/admin/product-form.js';

// ── normalizeVariants/normalizeSizes: defaults cuando no hay datos previos ──
assert.deepEqual(
    normalizeVariants(null, 5),
    [{ color: 'Original', hex: '#0b0b0b', stock: 5 }],
    'sin variantes previas: 1 fila default con el stock legado'
);
assert.deepEqual(
    normalizeVariants([{ color: ' Rojo ', hex: '#f00', stock: -3 }], 0),
    [{ color: 'Rojo', hex: '#f00', stock: 0 }],
    'trimea color, clampea stock negativo a 0'
);
assert.deepEqual(
    normalizeSizes(null, 7),
    [{ size: 'ÚNICO', stock: 7 }],
    'sin talles previos: 1 fila default ÚNICO con el stock legado'
);
assert.deepEqual(
    normalizeSizes([{ size: ' m ', stock: '4' }], 0),
    [{ size: 'M', stock: 4 }],
    'uppercase/trim + coerción a number'
);

// ── normalizeImageUrls: imagen única al frente, sin duplicar ────────────────
assert.deepEqual(normalizeImageUrls(['a.jpg', 'b.jpg'], 'a.jpg', ''), ['a.jpg', 'b.jpg'], 'ya está incluida, no duplica');
assert.deepEqual(normalizeImageUrls(['b.jpg'], 'a.jpg', ''), ['a.jpg', 'b.jpg'], 'antepone la imagen principal si falta');
assert.deepEqual(normalizeImageUrls([], '', 'legacy.jpg'), ['legacy.jpg'], 'cae a `image` si no hay imageUrl');

// ── computeStock: prioridad variantes > talles ───────────────────────────
assert.equal(computeStock([{ stock: 3 }, { stock: 2 }], [{ stock: 10 }]), 5, 'con stock por variantes, ese es el total');
assert.equal(computeStock([{ stock: 0 }], [{ stock: 4 }, { stock: 6 }]), 10, 'sin stock por variantes, cae a talles');
assert.equal(computeStock([], []), 0, 'sin nada: 0');

// ── validateVariantsAndSizes ─────────────────────────────────────────────
assert.deepEqual(validateVariantsAndSizes([], [{ size: 'M', stock: 1 }]), {
    ok: false, field: 'variants', message: 'Agregá al menos 1 variante de color.',
});
assert.deepEqual(validateVariantsAndSizes([{ color: 'Negro', stock: 1 }], []), {
    ok: false, field: 'sizes', message: 'Agregá al menos 1 talle.',
});
assert.deepEqual(
    validateVariantsAndSizes([{ color: 'Negro', stock: 1 }], [{ size: 'M', stock: 1 }, { size: 'm', stock: 2 }]),
    { ok: false, field: 'sizes', message: 'Talle duplicado: m' },
    'duplicado case-insensitive'
);
assert.deepEqual(
    validateVariantsAndSizes([{ color: 'Negro', stock: 1 }], [{ size: 'M', stock: 1 }]),
    { ok: true }
);

// ── validateImages ────────────────────────────────────────────────────────
assert.deepEqual(validateImages([{ url: 'a.jpg', uploading: true }]), {
    ok: false, message: 'Esperá a que terminen de subirse las imágenes.',
});
assert.deepEqual(validateImages([]), { ok: false, message: 'Agregá al menos 1 imagen.' });
assert.deepEqual(validateImages([{ url: 'a.jpg', uploading: false }]), { ok: true });

// ── buildProductPayload: filtra filas vacías, primera imagen lista como principal ──
const payload = buildProductPayload({
    name: 'Remera Test',
    category: 'Remeras',
    line: 'f1',
    description: 'desc',
    price: '15000',
    active: true,
    limited: false,
    variants: [{ color: 'Negro', hex: '#000', stock: 3 }, { color: '  ', hex: '#fff', stock: 5 }],
    sizes: [{ size: 'm', stock: 2 }, { size: '', stock: 9 }],
    images: [
        { url: 'https://x/1.jpg', uploading: false },
        { url: 'https://x/2.jpg', uploading: true },
    ],
});
assert.equal(payload.line, 'F1', 'line uppercased');
assert.equal(payload.price, 15000, 'price parseado a int');
assert.deepEqual(payload.variants, [{ color: 'Negro', hex: '#000', stock: 3 }], 'fila con color vacío descartada');
assert.deepEqual(payload.sizes, [{ size: 'M', stock: 2 }], 'fila con size vacío descartada');
assert.deepEqual(payload.images, ['https://x/1.jpg'], 'imagen aún subiendo excluida del payload');
assert.equal(payload.image, 'https://x/1.jpg');
assert.equal(payload.imageUrl, 'https://x/1.jpg');
assert.equal(payload.stock, 3, 'stock total = suma de variantes válidas');

// ── validateRequiredFields ────────────────────────────────────────────────
assert.deepEqual(validateRequiredFields(payload), { ok: true });
assert.deepEqual(validateRequiredFields({ ...payload, name: '' }), {
    ok: false, message: 'Por favor completa todos los campos requeridos',
});
assert.deepEqual(validateRequiredFields({ ...payload, price: NaN }), {
    ok: false, message: 'Por favor completa todos los campos requeridos',
});

// ── diffChangedFields: solo devuelve las claves que efectivamente cambiaron ──
const original = { name: 'A', price: 100, active: true };
const next = { name: 'A', price: 200, active: true };
assert.deepEqual(diffChangedFields(original, next), { price: 200 }, 'solo price cambió');
assert.deepEqual(diffChangedFields(null, next), next, 'sin original: todo se considera cambiado');
assert.deepEqual(diffChangedFields(original, original), {}, 'sin cambios: objeto vacío');

console.log('admin-product-form.test.mjs: all assertions passed');
