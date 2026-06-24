/**
 * Tests unitarios del helper de cupones. Uso: node tests/coupons.test.mjs
 */
import { normalizeCouponCode, isCouponValid, computeCouponDiscount } from '../api/_coupons.mjs';

let failed = 0;
function check(label, cond) {
    if (!cond) { console.error(`FAIL — ${label}`); failed++; }
}

// normalizeCouponCode
check('normalize trim + upper', normalizeCouponCode(' volt20 ') === 'VOLT20');
check('normalize quita espacios internos', normalizeCouponCode('volt 20') === 'VOLT20');
check('normalize null -> ""', normalizeCouponCode(null) === '');

// isCouponValid
const future = new Date(Date.now() + 86400000);
const past = new Date(Date.now() - 86400000);
check('activo válido', isCouponValid({ active: true, percent: 20 }).valid === true);
check('inactivo inválido', isCouponValid({ active: false, percent: 20 }).valid === false);
check('inexistente inválido', isCouponValid(null).valid === false);
check('percent 0 inválido', isCouponValid({ active: true, percent: 0 }).valid === false);
check('percent 101 inválido', isCouponValid({ active: true, percent: 101 }).valid === false);
check('percent no entero inválido', isCouponValid({ active: true, percent: 12.5 }).valid === false);
check('vencido inválido', isCouponValid({ active: true, percent: 20, expiresAt: past }).valid === false);
check('no vencido válido', isCouponValid({ active: true, percent: 20, expiresAt: future }).valid === true);

// computeCouponDiscount
check('20% de 10000 = 2000', computeCouponDiscount(10000, 20) === 2000);
check('redondea 199.8 -> 200', computeCouponDiscount(999, 20) === 200);

if (failed > 0) { console.error(`\n❌ ${failed} coupon helper checks failed`); process.exit(1); }
console.log('✅ coupon helper checks passed');
