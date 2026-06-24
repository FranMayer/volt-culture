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

// ── create-transfer-order ──
const transferApi = read('api/create-transfer-order.js');
inc('transfer importa _coupons', transferApi, "from './_coupons.mjs'");
inc('transfer lee body.couponCode', transferApi, 'body.couponCode');
inc('transfer setea discountSource coupon', transferApi, "discountSource = 'coupon'");
inc('transfer persiste coupon en orden', transferApi, 'coupon,');
inc('transfer persiste discountSource en orden', transferApi, 'discountSource,');
inc('transfer devuelve discountSource', transferApi, 'discountSource,');

// ── create-preference ──
const prefApi = read('api/create-preference.js');
inc('preference importa _coupons', prefApi, "from './_coupons.mjs'");
inc('preference lee body.couponCode', prefApi, 'body.couponCode');
inc('preference persiste discountSource', prefApi, 'discountSource');
inc('preference descuenta unit_price', prefApi, 'unitPrice');

// ── pagos.js (preview en checkout) ──
const pagosJs = read('js/pagos.js');
inc('pagos input de cupón', pagosJs, 'checkoutCouponInput');
inc('pagos botón aplicar', pagosJs, 'checkoutCouponApply');
inc('pagos estado _couponAplicado', pagosJs, '_couponAplicado');
inc('pagos lee colección coupons', pagosJs, "collection('coupons')");

if (failed > 0) { console.error(`\n❌ ${failed} coupon integration checks failed`); process.exit(1); }
console.log('✅ coupon integration checks passed');
