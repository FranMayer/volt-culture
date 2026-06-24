/**
 * Checks estáticos del wiring de cupones (estilo tests/transfer-flow.test.js).
 * Uso: node tests/coupons-integration.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

let failed = 0;
function inc(label, hay, needle) {
    if (!hay.includes(needle)) { console.error(`FAIL — ${label}: missing "${needle}"`); failed++; }
}

// ── Firestore rules ──
const rules = read('firestore.rules');
inc('rules: match coupons', rules, 'match /coupons/{couponId}');
inc('rules: coupons read público', rules, 'allow read: if true;');
inc('rules: coupons write admin', rules, 'request.auth.token.admin == true');

if (failed > 0) { console.error(`\n❌ ${failed} coupon integration checks failed`); process.exit(1); }
console.log('✅ coupon integration checks passed');
