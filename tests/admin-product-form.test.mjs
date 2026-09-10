/**
 * Ejercita lib/admin/product-form.js (lógica pura del form de producto del
 * panel admin) sin React ni Firestore. Uso: node tests/admin-product-form.test.mjs
 */
import assert from 'node:assert/strict';
import {
    normalizeVariants,
    normalizeSizes,
    normalizeImageUrls,
    validateVariantsAndSizes,
    validateImages,
    buildProductPayload,
    validateRequiredFields,
    diffChangedFields,
} from '../lib/admin/product-form.js';

// ── normalizeVariants: defaults cuando no hay datos previos, sin stock ──────
assert.deepEqual(
    normalizeVariants(null),
    [{ color: 'Original', hex: '#0b0b0b' }],
    'sin variantes previas: 1 fila default'
);
assert.deepEqual(
    normalizeVariants([{ color: ' Rojo ', hex: '#f00' }]),
    [{ color: 'Rojo', hex: '#f00' }],
    'trimea color'
);

// ── normalizeSizes: `available` explícito, o fallback a stock/fallbackAvailable ──
assert.deepEqual(
    normalizeSizes(null, true),
    [{ size: 'ÚNICO', available: true }],
    'sin talles previos: 1 fila default ÚNICO con el fallback dado'
);
assert.deepEqual(
    normalizeSizes(null, false),
    [{ size: 'ÚNICO', available: false }],
    'fallback false se respeta'
);
assert.deepEqual(
    normalizeSizes(null),
    [{ size: 'ÚNICO', available: true }],
    'sin fallback explícito, default a disponible'
);
assert.deepEqual(
    normalizeSizes([{ size: ' m ', available: false }], true),
    [{ size: 'M', available: false }],
    'uppercase/trim + available explícito respetado'
);
assert.deepEqual(
    normalizeSizes([{ size: 'l', stock: 3 }], true),
    [{ size: 'L', available: true }],
    'talle viejo sin available: fallback a stock > 0'
);
assert.deepEqual(
    normalizeSizes([{ size: 'l', stock: 0 }], true),
    [{ size: 'L', available: false }],
    'talle viejo sin available, stock 0: no disponible'
);

// ── normalizeImageUrls: imagen única al frente, sin duplicar ────────────────
assert.deepEqual(normalizeImageUrls(['a.jpg', 'b.jpg'], 'a.jpg', ''), ['a.jpg', 'b.jpg'], 'ya está incluida, no duplica');
assert.deepEqual(normalizeImageUrls(['b.jpg'], 'a.jpg', ''), ['a.jpg', 'b.jpg'], 'antepone la imagen principal si falta');
assert.deepEqual(normalizeImageUrls([], '', 'legacy.jpg'), ['legacy.jpg'], 'cae a `image` si no hay imageUrl');

// ── validateVariantsAndSizes: ya no exige stock, solo nombre ────────────────
assert.deepEqual(validateVariantsAndSizes([], [{ size: 'M', available: true }]), {
    ok: false, field: 'variants', message: 'Agregá al menos 1 variante de color.',
});
assert.deepEqual(validateVariantsAndSizes([{ color: 'Negro' }], []), {
    ok: false, field: 'sizes', message: 'Agregá al menos 1 talle.',
});
assert.deepEqual(
    validateVariantsAndSizes([{ color: 'Negro' }], [{ size: 'M', available: true }, { size: 'm', available: false }]),
    { ok: false, field: 'sizes', message: 'Talle duplicado: m' },
    'duplicado case-insensitive'
);
assert.deepEqual(
    validateVariantsAndSizes([{ color: 'Negro' }], [{ size: 'M', available: false }]),
    { ok: true },
    'un talle no disponible sigue siendo válido (no hace falta stock)'
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
    available: true,
    limited: false,
    variants: [{ color: 'Negro', hex: '#000' }, { color: '  ', hex: '#fff' }],
    sizes: [{ size: 'm', available: true }, { size: '', available: true }],
    images: [
        { url: 'https://x/1.jpg', uploading: false },
        { url: 'https://x/2.jpg', uploading: true },
    ],
});
assert.equal(payload.line, 'F1', 'line uppercased');
assert.equal(payload.price, 15000, 'price parseado a int');
assert.equal(payload.available, true);
assert.deepEqual(payload.variants, [{ color: 'Negro', hex: '#000' }], 'fila con color vacío descartada, sin stock');
assert.deepEqual(payload.sizes, [{ size: 'M', available: true }], 'fila con size vacío descartada, sin stock');
assert.deepEqual(payload.images, ['https://x/1.jpg'], 'imagen aún subiendo excluida del payload');
assert.equal(payload.image, 'https://x/1.jpg');
assert.equal(payload.imageUrl, 'https://x/1.jpg');
assert.ok(!('stock' in payload), 'el payload ya no escribe stock');

assert.equal(buildProductPayload({ ...payloadBase(), available: false }).available, false, '`available` false se respeta');

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

// ── promo 2x1 ──────────────────────────────────────────────────────────────
const formPromo = {
    name: 'Buzo TC', category: 'buzos', line: 'TC', description: '',
    price: '45000', active: true, available: true, limited: false, promo2x1: true,
    variants: [], sizes: [], images: [],
};
assert.equal(buildProductPayload(formPromo).promo2x1, true);
assert.equal(buildProductPayload({ ...formPromo, promo2x1: undefined }).promo2x1, false);

function payloadBase() {
    return {
        name: 'X', category: 'Remeras', line: 'TC', description: '', price: '100',
        active: true, available: true, limited: false, promo2x1: false,
        variants: [], sizes: [], images: [],
    };
}

console.log('admin-product-form.test.mjs: all assertions passed');
