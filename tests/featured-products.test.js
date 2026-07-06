/**
 * Checks estáticos de productos destacados. Uso: node tests/featured-products.test.js
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

let failed = 0;
function inc(label, hay, needle) {
    if (!hay.includes(needle)) { console.error(`FAIL — ${label}: missing "${needle}"`); failed++; }
}

// ── Home: filtra por featured con fallback a los primeros productos ──
const homeFeatured = read('js/home-featured.js');
inc('home filtra por featured', homeFeatured, 'p.featured === true');
inc('home cae a los primeros si no hay destacados', homeFeatured, 'flagged.length ? flagged : products');
inc('home ordena por featuredOrder', homeFeatured, 'a.featuredOrder ?? Infinity');

// ── Admin: estrella + toggleFeatured + expuesto en window ──
const adminProducts = read('js/admin-products.js');
inc('admin estrella llama toggleFeatured', adminProducts, 'toggleFeatured(');
inc('admin estrella usa dorado #FFD700', adminProducts, '#FFD700');
inc('admin define toggleFeatured', adminProducts, 'async function toggleFeatured');
inc('admin togglea el flag', adminProducts, 'featured: !isFeatured');
inc('admin expone window.toggleFeatured', adminProducts, 'window.toggleFeatured = toggleFeatured');
inc('admin auto-asigna el próximo orden al marcar', adminProducts, 'data.featuredOrder = maxOrder + 1');
inc('admin valida orden duplicado', adminProducts, 'ya lo usa');
inc('admin expone window.setFeaturedOrder', adminProducts, 'window.setFeaturedOrder = setFeaturedOrder');

if (failed > 0) { console.error(`\n❌ ${failed} featured checks failed`); process.exit(1); }
console.log('✅ featured products checks passed');
