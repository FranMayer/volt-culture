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

if (failed > 0) { console.error(`\n❌ ${failed} featured checks failed`); process.exit(1); }
console.log('✅ featured products checks passed');
