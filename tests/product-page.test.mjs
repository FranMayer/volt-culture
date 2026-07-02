/**
 * Tests del módulo de template de páginas de producto.
 * Uso: node tests/product-page.test.mjs
 */
import assert from 'node:assert';
import { slugify, productPath, buildImageArray, buildSitemap } from '../scripts/product-page-template.mjs';

const SITE = 'https://voltculture.com.ar';

// slugify
assert.equal(slugify('Hoodie F1 Negro'), 'hoodie-f1-negro', 'slugify básico');
assert.equal(slugify('Remera Ñandú Córdoba'), 'remera-nandu-cordoba', 'slugify acentos/ñ');
assert.equal(slugify('  ---  '), 'producto', 'slugify fallback');

// productPath
assert.equal(productPath({ name: 'Hoodie F1 Negro', id: 'a1b2c3' }), '/producto/hoodie-f1-negro-a1b2c3.html', 'productPath');

// buildImageArray: dedupe + absolutiza + varias fuentes
const imgs = buildImageArray({
    image: '/multi/front.png',
    images: ['/multi/front.png', { url: '/multi/back.png' }],
    variantImages: { Rojo: '/multi/rojo.png' },
    imagesByColor: { Negro: { src: 'https://cdn.x/negro.png' } }
}, SITE);
assert.deepEqual(imgs, [
    'https://voltculture.com.ar/multi/front.png',
    'https://voltculture.com.ar/multi/back.png',
    'https://voltculture.com.ar/multi/rojo.png',
    'https://cdn.x/negro.png'
], 'buildImageArray dedupe + absolutiza');

// buildSitemap
const xml = buildSitemap([{ name: 'Hoodie F1', id: 'x1' }], SITE);
assert.ok(xml.includes('<loc>https://voltculture.com.ar/pages/catalogo.html</loc>'), 'sitemap estáticas');
assert.ok(xml.includes('<loc>https://voltculture.com.ar/producto/hoodie-f1-x1.html</loc>'), 'sitemap producto');
assert.ok(xml.trimStart().startsWith('<?xml'), 'sitemap header');

console.log('✅ product-page helper checks passed');
