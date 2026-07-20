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
inc('rules: coupons get público', rules, 'allow get: if true;');
inc('rules: coupons list solo admin', rules, 'allow list: if request.auth != null && request.auth.token.admin == true;');
inc('rules: coupons write admin', rules, 'request.auth.token.admin == true');

// ── create-transfer-order ──
const transferApi = read('pages/api/create-transfer-order.js');
inc('transfer importa lib/server/coupons', transferApi, "from '@/lib/server/coupons'");
inc('transfer lee body.couponCode', transferApi, 'body.couponCode');
inc('transfer setea discountSource coupon', transferApi, "discountSource = 'coupon'");
inc('transfer persiste coupon en orden', transferApi, 'coupon,');
inc('transfer persiste discountSource en orden', transferApi, 'discountSource,');
inc('transfer devuelve discountSource', transferApi, 'discountSource,');

// ── create-preference ──
const prefApi = read('pages/api/create-preference.js');
inc('preference importa lib/server/coupons', prefApi, "from '@/lib/server/coupons'");
inc('preference lee body.couponCode', prefApi, 'body.couponCode');
inc('preference persiste discountSource', prefApi, 'discountSource');
inc('preference descuenta unit_price', prefApi, 'unitPrice');

// ── pagos.js (preview en checkout) ──
const pagosJs = read('legacy/js/pagos.js');
inc('pagos input de cupón', pagosJs, 'checkoutCouponInput');
inc('pagos botón aplicar', pagosJs, 'checkoutCouponApply');
inc('pagos estado _couponAplicado', pagosJs, '_couponAplicado');
inc('pagos lee colección coupons', pagosJs, "collection('coupons')");

// ── pagos.js (envío al backend + WhatsApp) ──
inc('pagos arma payload con couponCode', pagosJs, 'payload.couponCode');
inc('pagos manda couponCode en postBody', pagosJs, 'postBody.couponCode');
inc('pagos WA muestra descuento cupón', pagosJs, 'Descuento cupón');

// ── admin ──
const adminHtml = read('legacy/admin/panel.html');
inc('admin tab cupones', adminHtml, 'data-tab="cupones"');
inc('admin tab-content cupones', adminHtml, 'id="tab-cupones"');
inc('admin importa admin-coupons', adminHtml, 'admin-coupons.js');
const adminUiJs = read('legacy/js/admin-ui.js');
inc('admin-ui carga cupones en tab', adminUiJs, "tabId === 'cupones'");
const adminCouponsJs = read('legacy/js/admin-coupons.js');
inc('admin-coupons usa colección coupons', adminCouponsJs, "collection('coupons')");
inc('admin-coupons exporta loadCoupons', adminCouponsJs, 'export async function loadCoupons');

if (failed > 0) { console.error(`\n❌ ${failed} coupon integration checks failed`); process.exit(1); }
console.log('✅ coupon integration checks passed');
