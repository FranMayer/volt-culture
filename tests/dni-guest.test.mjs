/**
 * Checks estructurales: DNI persistido/validado (N6) y checkout sin login (N2).
 * Uso: node tests/dni-guest.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function inc(label, hay, needle) {
    if (!hay.includes(needle)) { console.error(`FAIL — ${label}: falta "${needle}"`); failed++; }
}
function exc(label, hay, needle) {
    if (hay.includes(needle)) { console.error(`FAIL — ${label}: no debería contener "${needle}"`); failed++; }
}

// N6 — DNI en ambos endpoints
for (const f of ['api/create-preference.js', 'api/create-transfer-order.js']) {
    const src = read(f);
    inc(`${f} valida DNI`, src, "/^\\d{7,8}$/");
    inc(`${f} guarda dni en customer`, src, 'dni');
}

// N2 — pagos.js no debe exigir login para comprar
const pagos = read('js/pagos.js');
exc('pagos.js sin gate requireAuth', pagos, 'requireAuth');

// SEO1 — catálogo abre quick-view por ?product=
const catalog = read('js/catalog.js');
inc('catalog lee ?product', catalog, "get('product')");
inc('catalog abre quick-view del deep-link', catalog, 'openQuickView');

if (failed) { console.error(`\n❌ ${failed} check(s) fallaron`); process.exit(1); }
console.log('✅ dni/guest checks passed');
