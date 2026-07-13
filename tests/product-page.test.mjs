/**
 * Tests del módulo de template de páginas de producto.
 * Uso: node tests/product-page.test.mjs
 */
import assert from 'node:assert';
import { slugify, productPath, buildImageArray, buildSitemap, renderProductPage } from '../scripts/product-page-template.mjs';

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

// renderProductPage
const html = renderProductPage({
    id: 'x1',
    name: 'Hoodie F1 Negro',
    description: 'Buzo motorsport',
    price: 45000,
    image: '/multi/front.png',
    variants: [{ color: 'Negro', hex: '#000', stock: 4 }],
    sizes: [{ size: 'M', stock: 2 }]
}, { siteUrl: SITE });

assert.ok(html.includes('"@type":"Product"'), 'JSON-LD Product');
assert.ok(html.includes('"priceCurrency":"ARS"'), 'JSON-LD ARS');
assert.ok(html.includes('"price":"45000"'), 'JSON-LD price');
assert.ok(html.includes('"availability":"https://schema.org/InStock"'), 'JSON-LD InStock');
assert.ok(html.includes('<link rel="canonical" href="https://voltculture.com.ar/producto/hoodie-f1-negro-x1.html">'), 'canonical');
assert.ok(html.includes('/pages/catalogo.html?product=x1'), 'CTA deep-link');
assert.ok(html.includes('firebasejs/9.22.0/firebase-app-compat.js'), 'script hidratación');
assert.ok(html.includes('data-pp-price'), 'hook de precio para hidratar');
assert.ok(html.includes('"@type":"BreadcrumbList"'), 'JSON-LD BreadcrumbList');
assert.ok(html.includes('"item":"https://voltculture.com.ar/pages/catalogo.html"'), 'breadcrumb apunta al catálogo');

// Galería: 1 imagen → sin tira de miniaturas; 2+ → tira con thumb activo.
assert.ok(!html.includes('<div class="pp-thumbs">'), 'una sola imagen no muestra miniaturas');
const htmlMulti = renderProductPage({
    id: 'g1', name: 'Buzo', price: 1000,
    image: '/multi/front.png', images: ['/multi/front.png', '/multi/back.png']
}, { siteUrl: SITE });
assert.ok(htmlMulti.includes('class="pp-thumbs"'), 'varias imágenes muestran miniaturas');
assert.ok(htmlMulti.includes('data-src="https://voltculture.com.ar/multi/back.png"'), 'thumb con la 2da imagen');
assert.ok(htmlMulti.includes('pp-thumb is-active'), 'primer thumb activo');

// Fix: el JSON-LD no debe permitir breakout de </script>
const htmlXss = renderProductPage({
    id: 'x9', name: 'Hack </script><script>alert(1)</script>', price: 1000, image: '/x.png'
}, { siteUrl: SITE });
const ldStart = htmlXss.indexOf('application/ld+json">') + 'application/ld+json">'.length;
const ldEnd = htmlXss.indexOf('</script>', ldStart);
const ldBlock = htmlXss.slice(ldStart, ldEnd);
assert.ok(!ldBlock.includes('</script>'), 'JSON-LD no contiene </script> literal sin escapar');
assert.ok(ldBlock.includes('\\u003c/script>'), 'JSON-LD escapa < como \\u003c');

// Fix: el id interpolado en el script de hidratación tampoco debe permitir
// breakout de </script> (mismo patrón que el JSON-LD).
const htmlIdXss = renderProductPage({
    id: 'x</script><script>alert(1)</script>', name: 'P', price: 1000, image: '/x.png'
}, { siteUrl: SITE });
assert.ok(!htmlIdXss.includes('</script><script>alert(1)'), 'ningún path (JSON-LD, hydration, CTA) filtra el id crudo');

console.log('✅ product-page helper checks passed');
