/**
 * Ejercita la lógica pura de lib/catalog-helpers.js (port de legacy/js/catalog.js)
 * sin DOM/React/Firestore. Uso: node tests/catalog-helpers.test.mjs
 */
import assert from 'node:assert/strict';
import {
    computeAvailableStock,
    getImageForColor,
    getProductGallery,
    isHoodieProduct,
    getProductTypeLabel,
    defaultVariantSelection,
    slugify,
    productPath,
    matchFilterFromQuery,
    catalogHref,
    buildImageArray,
    totalStock,
} from '../lib/catalog-helpers.js';

// ── computeAvailableStock: color+talle, solo color, solo talle, ninguno ────
const product = {
    stock: 5,
    variants: [{ color: 'Negro', stock: 3 }, { color: 'Rojo', stock: 0 }],
    sizes: [{ size: 'M', stock: 2 }, { size: 'L', stock: 4 }],
};
assert.equal(computeAvailableStock(product, 'Negro', 'M'), 2, 'min(color, talle)');
assert.equal(computeAvailableStock(product, 'Negro', 'L'), 3, 'min(3,4) = 3');
assert.equal(computeAvailableStock(product, 'Rojo', 'L'), 0, 'color sin stock manda 0');
assert.equal(computeAvailableStock(product, 'Negro', null), 3, 'solo color');
assert.equal(computeAvailableStock(product, null, 'M'), 2, 'solo talle');
assert.equal(computeAvailableStock(product, null, null), 5, 'sin selección -> stock del producto');
assert.equal(computeAvailableStock({ stock: 5, variants: [], sizes: [] }, 'X', 'Y'), 5, 'variantes/talles vacíos -> stock producto');

// ── getImageForColor: variantImages/imagesByColor y objetos en images[] ───
assert.equal(getImageForColor({ variantImages: { Negro: 'a.jpg' } }, 'Negro'), 'a.jpg');
assert.equal(getImageForColor({ imagesByColor: { Rojo: 'b.jpg' } }, 'Rojo'), 'b.jpg');
assert.equal(
    getImageForColor({ images: [{ color: 'Azul', url: 'c.jpg' }] }, 'Azul'),
    'c.jpg'
);
assert.equal(getImageForColor({}, ''), '', 'sin color -> vacío');
assert.equal(getImageForColor({}, 'Negro'), '', 'sin match -> vacío');

// ── getProductGallery: principal primero, sin duplicar ─────────────────────
assert.deepEqual(
    getProductGallery({ image: 'main.jpg', images: ['a.jpg', 'main.jpg'] }),
    ['a.jpg', 'main.jpg'],
    'main ya presente en images[] -> no se duplica ni se reordena'
);
assert.deepEqual(
    getProductGallery({ image: 'main.jpg', images: ['a.jpg'] }),
    ['main.jpg', 'a.jpg'],
    'main ausente de images[] -> se antepone (unshift)'
);
assert.deepEqual(getProductGallery({ image: 'main.jpg', images: [] }), ['main.jpg']);
assert.deepEqual(getProductGallery({ images: [{ url: 'x.jpg' }] }), ['x.jpg']);

// ── isHoodieProduct / getProductTypeLabel ──────────────────────────────────
assert.equal(isHoodieProduct({ category: 'Buzos' }), true);
assert.equal(isHoodieProduct({ category: 'Remeras', name: 'Hoodie negro' }), true);
assert.equal(isHoodieProduct({ category: 'Remeras', name: 'Remera x' }), false);
assert.equal(getProductTypeLabel({ category: 'Buzos' }), 'HOODIE');
assert.equal(getProductTypeLabel({ category: 'Remeras' }), 'REMERA');
assert.equal(getProductTypeLabel({ category: 'Gorras' }), 'GORRA');
assert.equal(getProductTypeLabel({ category: 'Autos a escala' }), 'ESCALA');
assert.equal(getProductTypeLabel({ category: 'Pantalones' }), 'PANTALONE', 'fallback: categoría sin "s" final, uppercased');
assert.equal(getProductTypeLabel({ category: '' }), '');

// ── defaultVariantSelection: prioriza stock > 0 ────────────────────────────
assert.deepEqual(
    defaultVariantSelection({
        variants: [{ color: 'Rojo', stock: 0 }, { color: 'Negro', stock: 3 }],
        sizes: [{ size: 'S', stock: 0 }, { size: 'M', stock: 1 }],
    }),
    { selectedColor: 'Negro', selectedSize: 'M' }
);
assert.deepEqual(
    defaultVariantSelection({ variants: [{ color: 'Rojo', stock: 0 }], sizes: [] }),
    { selectedColor: 'Rojo', selectedSize: '' },
    'todas sin stock -> cae a la primera igual'
);
assert.deepEqual(defaultVariantSelection({}), { selectedColor: '', selectedSize: '' });

// ── slugify / productPath ───────────────────────────────────────────────
assert.equal(slugify('Remera Ferrari F1'), 'remera-ferrari-f1');
assert.equal(slugify('Remera Ñandú / Édition!'), 'remera-nandu-edition');
assert.equal(slugify(''), 'producto');
assert.equal(productPath({ name: 'Remera Ferrari', id: 'ferrari-001' }), '/producto/remera-ferrari-ferrari-001');

// ── matchFilterFromQuery ──────────────────────────────────────
assert.equal(matchFilterFromQuery('', ''), null, 'sin params -> null (default se mantiene)');
assert.deepEqual(matchFilterFromQuery('f1', 'remeras'), { line: 'F1', category: 'Remeras' });
assert.deepEqual(matchFilterFromQuery('TC', ''), { line: 'TC', category: 'all' }, 'solo line -> category all');
assert.deepEqual(matchFilterFromQuery('jdm', ''), { line: 'JDM', category: 'all' }, 'estetica nueva');
assert.deepEqual(matchFilterFromQuery('gt', 'gorras'), { line: 'GT', category: 'Gorras' });
assert.deepEqual(
    matchFilterFromQuery('', 'gorras'),
    { line: 'all', category: 'Gorras' },
    'cat sin line -> gorras de todas las esteticas (los ejes son independientes)'
);
assert.deepEqual(
    matchFilterFromQuery('xx', 'remeras'),
    { line: 'all', category: 'Remeras' },
    'linea inexistente degrada a all, no descarta la categoria valida'
);

// ── buildImageArray: dedupe + absolutiza + varias fuentes (F5, mismo caso
//    que tests/product-page.test.mjs para la versión legacy de esta función) ─
const SITE = 'https://voltculture.com.ar';
assert.deepEqual(
    buildImageArray({
        image: '/multi/front.png',
        images: ['/multi/front.png', { url: '/multi/back.png' }],
        variantImages: { Rojo: '/multi/rojo.png' },
        imagesByColor: { Negro: { src: 'https://cdn.x/negro.png' } },
    }, SITE),
    [
        'https://voltculture.com.ar/multi/front.png',
        'https://voltculture.com.ar/multi/back.png',
        'https://voltculture.com.ar/multi/rojo.png',
        'https://cdn.x/negro.png',
    ],
    'buildImageArray dedupe + absolutiza'
);
assert.deepEqual(buildImageArray({}, SITE), [], 'buildImageArray sin imágenes -> vacío');

// ── totalStock: variantes > talles > stock plano ───────────────────────────
assert.equal(totalStock({ variants: [{ stock: 3 }, { stock: 2 }], sizes: [{ stock: 9 }], stock: 1 }), 5, 'suma variantes');
assert.equal(totalStock({ sizes: [{ stock: 4 }, { stock: 1 }], stock: 1 }), 5, 'sin variantes -> suma talles');
assert.equal(totalStock({ stock: 7 }), 7, 'sin variantes/talles -> stock plano');
assert.equal(totalStock({}), 0);

console.log('catalog-helpers.test.mjs OK');

// ── catalogHref: link propio por categoría, round-trip con matchFilterFromQuery ──
assert.equal(catalogHref({ line: 'all', category: 'all' }), '/catalogo', 'sin filtro -> URL limpia');
assert.equal(catalogHref({ line: 'F1', category: 'all' }), '/catalogo?line=f1');
assert.equal(catalogHref({ line: 'all', category: 'Remeras' }), '/catalogo?cat=remeras');
assert.equal(catalogHref({ line: 'JDM', category: 'Buzos' }), '/catalogo?line=jdm&cat=buzos');
assert.equal(catalogHref(), '/catalogo', 'sin argumento no explota');

for (const state of [
    { line: 'all', category: 'all' },
    { line: 'F1', category: 'all' },
    { line: 'all', category: 'Gorras' },
    { line: 'GT', category: 'Pantalones' },
    { line: 'TC', category: 'Remeras' },
]) {
    const params = new URLSearchParams(catalogHref(state).split('?')[1] || '');
    const back = matchFilterFromQuery(params.get('line'), params.get('cat')) ?? { line: 'all', category: 'all' };
    assert.deepEqual(back, state, `round-trip de ${JSON.stringify(state)}`);
}
