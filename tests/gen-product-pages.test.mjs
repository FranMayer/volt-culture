/**
 * Test de generate(): escribe páginas + sitemap en un tmp dir.
 * Uso: node tests/gen-product-pages.test.mjs
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generate } from '../scripts/gen-product-pages.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'volt-gen-'));
const productsDir = path.join(tmp, 'producto');
const sitemapPath = path.join(tmp, 'sitemap.xml');

const count = generate(
    [
        { id: 'x1', name: 'Hoodie F1 Negro', price: 45000, image: '/multi/front.png', variants: [{ color: 'Negro', hex: '#000', stock: 3 }] },
        { id: 'x2', name: 'Remera Colapinto', price: 25000, image: '/multi/rem.png' }
    ],
    { productsDir, sitemapPath, siteUrl: 'https://voltculture.com.ar' }
);

assert.equal(count, 2, 'genera 2 páginas');
assert.ok(fs.existsSync(path.join(productsDir, 'hoodie-f1-negro-x1.html')), 'archivo producto 1');
assert.ok(fs.existsSync(path.join(productsDir, 'remera-colapinto-x2.html')), 'archivo producto 2');
const sitemap = fs.readFileSync(sitemapPath, 'utf8');
assert.ok(sitemap.includes('/producto/hoodie-f1-negro-x1.html'), 'sitemap incluye producto');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('✅ gen-product-pages checks passed');
