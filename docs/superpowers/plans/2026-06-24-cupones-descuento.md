# Cupones de descuento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que el cliente ingrese un código de cupón en el checkout y obtenga un % de descuento sobre los productos, no acumulable con el −10% de transferencia (lo reemplaza), gestionado desde el panel admin.

**Architecture:** Un helper puro ESM (`api/_coupons.mjs`) centraliza normalización y validación, reutilizado por los dos endpoints serverless (fuente de verdad). El cliente lee el cupón de Firestore para previsualizar el descuento, pero el backend siempre re-valida y recalcula. Una colección `coupons` en Firestore se administra desde una tab nueva en el panel admin.

**Tech Stack:** Vanilla JS (sin bundler), Firebase compat 9.22 (cliente) + firebase-admin (backend ESM en `/api`), Mercado Pago SDK, tests en Node con `node tests/*.mjs`.

## Global Constraints

- Sin build step: el navegador **no puede** importar `api/_coupons.mjs` (es ESM de Node y `/api/*` son funciones serverless, no estáticos). El cliente y el admin **duplican** la validación mínima inline.
- Helper compartido y test = `.mjs` para ESM inequívoco (`package.json` no tiene `"type":"module"`). Tests se corren con `node tests/<archivo>.mjs`.
- Descuento del cupón: **% entero 1–100, solo sobre el total de productos** (no toca envío).
- No acumulable: si hay cupón válido **reemplaza** al −10% de transferencia y es el único descuento en MP.
- Redondeo consistente front/back: `Math.round`.
- Normalización de código: `trim` → `toUpperCase` → quitar espacios internos. Doc ID = código normalizado.
- Paleta y estilos existentes: rojo `#c1121f`, verde de descuento `#6daa6d` (ya usado en `.volt-summary-discount`).
- Primer cupón a crear (manual desde admin tras deploy): `VOLT20` = 20%.

---

### Task 1: Helper puro de cupones + tests unitarios

**Files:**
- Create: `api/_coupons.mjs`
- Test: `tests/coupons.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `normalizeCouponCode(code: string) -> string`
  - `isCouponValid(data: object|null, now?: Date) -> { valid: boolean, reason?: string }`
  - `computeCouponDiscount(productsTotal: number, percent: number) -> number`

- [ ] **Step 1: Write the failing test**

Create `tests/coupons.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/coupons.test.mjs`
Expected: FAIL — error de import (`Cannot find module '../api/_coupons.mjs'`).

- [ ] **Step 3: Write minimal implementation**

Create `api/_coupons.mjs`:

```js
/**
 * Helpers puros para cupones de descuento.
 * Sin dependencias de red: el documento Firestore se busca en cada endpoint
 * y se le pasa `data` a estas funciones (testeable sin Firestore).
 */

/** Normaliza un código: trim, mayúsculas, sin espacios internos. */
export function normalizeCouponCode(code) {
    return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

/** Firestore Timestamp | string | number | Date -> Date (o null). */
function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {object|null} data - data del doc Firestore (o null si no existe)
 * @param {Date} [now]
 * @returns {{ valid: boolean, reason?: string }}
 */
export function isCouponValid(data, now = new Date()) {
    if (!data) return { valid: false, reason: 'not_found' };
    if (data.active !== true) return { valid: false, reason: 'inactive' };
    const percent = Number(data.percent);
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
        return { valid: false, reason: 'bad_percent' };
    }
    const exp = toDate(data.expiresAt);
    if (exp && exp.getTime() <= now.getTime()) {
        return { valid: false, reason: 'expired' };
    }
    return { valid: true };
}

/** Descuento entero (redondeado) sobre el total de productos. */
export function computeCouponDiscount(productsTotal, percent) {
    return Math.round(Number(productsTotal || 0) * Number(percent) / 100);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/coupons.test.mjs`
Expected: `✅ coupon helper checks passed`

- [ ] **Step 5: Commit**

```bash
git add api/_coupons.mjs tests/coupons.test.mjs
git commit -m "feat(coupons): pure coupon validation/normalization helper + unit tests"
```

---

### Task 2: Reglas Firestore para `coupons` + scaffold de test de integración

**Files:**
- Modify: `firestore.rules`
- Create: `tests/coupons-integration.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: archivo `tests/coupons-integration.test.mjs` con helper `inc(label, haystack, needle)` y `read(rel)` que las tareas siguientes amplían.

- [ ] **Step 1: Write the failing test**

Create `tests/coupons-integration.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/coupons-integration.test.mjs`
Expected: FAIL — `rules: match coupons: missing "match /coupons/{couponId}"`.

- [ ] **Step 3: Add the rule**

In `firestore.rules`, after the `products` block (currently lines 6–9), insert:

```
    // Cupones: lectura pública (preview en checkout), escritura solo admin.
    match /coupons/{couponId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/coupons-integration.test.mjs`
Expected: `✅ coupon integration checks passed`

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/coupons-integration.test.mjs
git commit -m "feat(coupons): firestore rules for coupons collection + integration test scaffold"
```

---

### Task 3: Backend — `create-transfer-order.js` aplica cupón

**Files:**
- Modify: `api/create-transfer-order.js`
- Test: `tests/coupons-integration.test.mjs` (append)

**Interfaces:**
- Consumes: `normalizeCouponCode`, `isCouponValid`, `computeCouponDiscount` (Task 1).
- Produces: endpoint que acepta `body.couponCode`, guarda en la orden `coupon`, `discountSource`, `discountPercent`, `discountAmount`, `subtotal`, `total`, y los devuelve en el JSON de respuesta.

- [ ] **Step 1: Write the failing test**

Append to `tests/coupons-integration.test.mjs`, **before** the `if (failed > 0)` block:

```js
// ── create-transfer-order ──
const transferApi = read('api/create-transfer-order.js');
inc('transfer importa _coupons', transferApi, "from './_coupons.mjs'");
inc('transfer lee body.couponCode', transferApi, 'body.couponCode');
inc('transfer setea discountSource coupon', transferApi, "discountSource = 'coupon'");
inc('transfer persiste coupon en orden', transferApi, 'coupon,');
inc('transfer persiste discountSource en orden', transferApi, 'discountSource,');
inc('transfer devuelve discountSource', transferApi, 'discountSource,');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/coupons-integration.test.mjs`
Expected: FAIL — `transfer importa _coupons: missing "from './_coupons.mjs'"`.

- [ ] **Step 3: Add the import**

In `api/create-transfer-order.js`, after the existing imports (after line 19 `import { SHIPPING_CONFIG } ...`), add:

```js
import { normalizeCouponCode, isCouponValid, computeCouponDiscount } from './_coupons.mjs';
```

- [ ] **Step 4: Replace the discount computation**

Replace this block (currently lines 226–230):

```js
        const productsTotal = normalizedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
        const subtotal = productsTotal + shippingCost;
        // Mismo redondeo que el frontend (renderSummary / buildTransferWaUrl).
        const discountAmount = Math.round(subtotal * TRANSFER_DISCOUNT_RATE);
        const total = subtotal - discountAmount;
```

with:

```js
        const productsTotal = normalizedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
        const subtotal = productsTotal + shippingCost;

        // Default: descuento por transferencia (−10% sobre subtotal).
        let coupon = null;
        let discountSource = 'transfer';
        let discountPercent = Math.round(TRANSFER_DISCOUNT_RATE * 100);
        let discountAmount = Math.round(subtotal * TRANSFER_DISCOUNT_RATE);

        // Cupón válido REEMPLAZA al −10% (descuento solo sobre productos).
        const couponCode = normalizeCouponCode(body.couponCode);
        if (couponCode) {
            const couponSnap = await db.collection('coupons').doc(couponCode).get();
            const couponData = couponSnap.exists ? couponSnap.data() : null;
            if (isCouponValid(couponData).valid) {
                coupon = couponData.code || couponCode;
                discountSource = 'coupon';
                discountPercent = Number(couponData.percent);
                discountAmount = computeCouponDiscount(productsTotal, discountPercent);
            }
        }

        const total = subtotal - discountAmount;
```

- [ ] **Step 5: Persist the new fields on the order**

In the `orderRef.set({ ... })` call, replace this line (currently line 249):

```js
                discountPercent: Math.round(TRANSFER_DISCOUNT_RATE * 100),
```

with:

```js
                coupon,
                discountSource,
                discountPercent,
```

- [ ] **Step 6: Return the new fields**

Replace the final success response (currently lines 264–270):

```js
        return res.status(200).json({
            orderId,
            total,
            subtotal,
            discountAmount,
            discountPercent: Math.round(TRANSFER_DISCOUNT_RATE * 100)
        });
```

with:

```js
        return res.status(200).json({
            orderId,
            total,
            subtotal,
            discountAmount,
            discountPercent,
            discountSource,
            coupon
        });
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `node tests/coupons-integration.test.mjs && node tests/transfer-flow.test.js`
Expected: both print their `✅ ... passed` line (transfer-flow still passes: `discountAmount,` and `orderId,` remain present, `TRANSFER_DISCOUNT_RATE = 0.10` unchanged).

- [ ] **Step 8: Commit**

```bash
git add api/create-transfer-order.js tests/coupons-integration.test.mjs
git commit -m "feat(coupons): apply coupon discount in create-transfer-order (replaces transfer 10%)"
```

---

### Task 4: Backend — `create-preference.js` aplica cupón (Mercado Pago)

**Files:**
- Modify: `api/create-preference.js`
- Test: `tests/coupons-integration.test.mjs` (append)

**Interfaces:**
- Consumes: `normalizeCouponCode`, `isCouponValid` (Task 1).
- Produces: endpoint que acepta `body.couponCode`, baja el `unit_price` de cada producto en el % del cupón, y guarda en la orden `subtotal`, `discountPercent`, `discountAmount`, `coupon`, `discountSource`.

- [ ] **Step 1: Write the failing test**

Append to `tests/coupons-integration.test.mjs`, before the `if (failed > 0)` block:

```js
// ── create-preference ──
const prefApi = read('api/create-preference.js');
inc('preference importa _coupons', prefApi, "from './_coupons.mjs'");
inc('preference lee body.couponCode', prefApi, 'body.couponCode');
inc('preference persiste discountSource', prefApi, 'discountSource');
inc('preference descuenta unit_price', prefApi, 'unitPrice');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/coupons-integration.test.mjs`
Expected: FAIL — `preference importa _coupons: missing "from './_coupons.mjs'"`.

- [ ] **Step 3: Add the import**

In `api/create-preference.js`, after the existing imports (after line 6 `import { SHIPPING_CONFIG } ...`), add:

```js
import { normalizeCouponCode, isCouponValid } from './_coupons.mjs';
```

- [ ] **Step 4: Compute discounted product prices**

Replace this block (currently lines 234–235):

```js
        const productsTotal = normalizedItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const total = productsTotal + shippingCost;
```

with:

```js
        const productsTotal = normalizedItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);

        // Cupón válido: baja el unit_price de cada producto en su %.
        let coupon = null;
        let discountSource = null;
        let discountPercent = 0;
        const couponCode = normalizeCouponCode(body.couponCode);
        if (couponCode) {
            const couponSnap = await db.collection('coupons').doc(couponCode).get();
            const couponData = couponSnap.exists ? couponSnap.data() : null;
            if (isCouponValid(couponData).valid) {
                coupon = couponData.code || couponCode;
                discountSource = 'coupon';
                discountPercent = Number(couponData.percent);
            }
        }

        const discountedItems = normalizedItems.map((i) => ({
            ...i,
            unitPrice: discountPercent ? Math.round(i.price * (100 - discountPercent) / 100) : i.price
        }));
        const discountedProductsTotal = discountedItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
        const discountAmount = productsTotal - discountedProductsTotal;
        const subtotal = productsTotal + shippingCost;
        const total = discountedProductsTotal + shippingCost;
```

- [ ] **Step 5: Persist the new fields on the order**

In the `orderRef.set({ ... })` call, replace this line (currently line 251):

```js
                total,
```

with:

```js
                subtotal,
                discountPercent,
                discountAmount,
                coupon,
                discountSource,
                total,
```

- [ ] **Step 6: Use discounted prices in the Mercado Pago items**

Replace the `mpItems` mapping (currently lines 263–271):

```js
        const mpItems = normalizedItems.map((item, index) => ({
            id: `${item.id}-${index}`,
            title: item.title,
            description: [item.title, item.variantColor, item.variantSize].filter(Boolean).join(' · ') || item.title,
            category_id: 'fashion',
            quantity: item.quantity,
            currency_id: 'ARS',
            unit_price: item.price
        }));
```

with:

```js
        const mpItems = discountedItems.map((item, index) => ({
            id: `${item.id}-${index}`,
            title: item.title,
            description: [item.title, item.variantColor, item.variantSize].filter(Boolean).join(' · ') || item.title,
            category_id: 'fashion',
            quantity: item.quantity,
            currency_id: 'ARS',
            unit_price: item.unitPrice
        }));
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `node tests/coupons-integration.test.mjs`
Expected: `✅ coupon integration checks passed`

- [ ] **Step 8: Commit**

```bash
git add api/create-preference.js tests/coupons-integration.test.mjs
git commit -m "feat(coupons): apply coupon discount to Mercado Pago preference + order"
```

---

### Task 5: Checkout — input de cupón, validación cliente y preview en el resumen

**Files:**
- Modify: `js/pagos.js`
- Test: `tests/coupons-integration.test.mjs` (append)

**Interfaces:**
- Consumes: `firebase.firestore()` (compat global, ya cargado en `catalogo.html`), `renderSummary(modalEl, cart, customer, shippingState, mode)` existente.
- Produces: variable de módulo `_couponAplicado` (`{ code, percent } | null`), helpers `normalizeCouponCode`, `couponValidity`, y elementos DOM `#checkoutCouponInput`, `#checkoutCouponApply`, `#checkoutCouponRemove`, `#checkoutCouponFeedback`. `renderSummary` muestra la línea del cupón.

- [ ] **Step 1: Write the failing test**

Append to `tests/coupons-integration.test.mjs`, before the `if (failed > 0)` block:

```js
// ── pagos.js (preview en checkout) ──
const pagosJs = read('js/pagos.js');
inc('pagos input de cupón', pagosJs, 'checkoutCouponInput');
inc('pagos botón aplicar', pagosJs, 'checkoutCouponApply');
inc('pagos estado _couponAplicado', pagosJs, '_couponAplicado');
inc('pagos lee colección coupons', pagosJs, "collection('coupons')");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/coupons-integration.test.mjs`
Expected: FAIL — `pagos input de cupón: missing "checkoutCouponInput"`.

- [ ] **Step 3: Add module state**

In `js/pagos.js`, right after line 41 (`let _shippingConfirmado = null;`), add:

```js
    /** Cupón aplicado en el paso 3 ({ code, percent }) o null. Se resetea al abrir el modal. */
    let _couponAplicado = null;
```

- [ ] **Step 4: Add client normalize + validity helpers**

In `js/pagos.js`, immediately after `function formatMoney(n) { ... }` (ends at line 347), add:

```js
    function normalizeCouponCode(code) {
        return String(code || "").trim().toUpperCase().replace(/\s+/g, "");
    }

    function couponValidity(data, now = new Date()) {
        if (!data) return { valid: false, reason: "No encontramos ese cupón." };
        if (data.active !== true) return { valid: false, reason: "Ese cupón no está activo." };
        const percent = Number(data.percent);
        if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
            return { valid: false, reason: "Cupón inválido." };
        }
        if (data.expiresAt) {
            const exp = typeof data.expiresAt.toDate === "function"
                ? data.expiresAt.toDate()
                : new Date(data.expiresAt);
            if (exp && !Number.isNaN(exp.getTime()) && exp.getTime() <= now.getTime()) {
                return { valid: false, reason: "Ese cupón está vencido." };
            }
        }
        return { valid: true, percent };
    }
```

- [ ] **Step 5: Add the coupon UI to the step-3 modal markup**

In `createCustomerModal`, replace this line (currently line 236):

```html
                            <ul class="volt-summary-list" id="checkoutSummaryItems"></ul>
```

with:

```html
                            <ul class="volt-summary-list" id="checkoutSummaryItems"></ul>
                            <div class="volt-coupon" id="checkoutCouponBlock">
                                <label class="form-label" for="checkoutCouponInput">¿Tenés un cupón?</label>
                                <div class="volt-coupon__row">
                                    <input type="text" class="form-control" id="checkoutCouponInput" placeholder="Ej: VOLT20" autocomplete="off" style="${CHECKOUT_INPUT_STYLE}">
                                    <button type="button" class="btn btn-danger btn-sm" id="checkoutCouponApply">Aplicar</button>
                                    <button type="button" class="btn btn-outline-light btn-sm d-none" id="checkoutCouponRemove">Quitar</button>
                                </div>
                                <div class="volt-coupon__feedback" id="checkoutCouponFeedback" role="status"></div>
                            </div>
```

- [ ] **Step 6: Add coupon CSS**

In `injectCheckoutStyles`, before the closing `` ` `` of the style template (right after the `.volt-summary-total-transfer` rule, currently line 129), add:

```css
            #customerDataModal .volt-coupon { margin:0.25rem 0 1rem; }
            #customerDataModal .volt-coupon__row { display:flex; gap:0.4rem; flex-wrap:wrap; }
            #customerDataModal .volt-coupon__row .form-control { flex:1 1 auto; min-width:0; text-transform:uppercase; }
            #customerDataModal .volt-coupon__feedback { font-size:0.78rem; margin-top:0.35rem; min-height:1em; }
            #customerDataModal .volt-coupon__feedback.is-ok { color:#6daa6d; }
            #customerDataModal .volt-coupon__feedback.is-error { color:#e06b6b; }
```

- [ ] **Step 7: Make `renderSummary` show the coupon line**

In `renderSummary`, replace the `let totalLine; if (mode === 'transfer') { ... } else { ... }` block (currently lines 383–393):

```js
        let totalLine;
        if (mode === 'transfer') {
            const discountAmount = Math.round(subtotal * TRANSFER_DISCOUNT);
            const finalTotal = subtotal - discountAmount;
            totalLine =
                `<li><span>Subtotal</span><span>${formatMoney(subtotal)}</span></li>` +
                `<li class="volt-summary-discount"><span>Descuento transferencia (−10%)</span><span>−${formatMoney(discountAmount)}</span></li>` +
                `<li class="volt-summary-total-transfer"><span><strong>Total a transferir</strong></span><span><strong>${formatMoney(finalTotal)}</strong></span></li>`;
        } else {
            totalLine = `<li><span><strong>Total</strong></span><span><strong>${formatMoney(subtotal)}</strong></span></li>`;
        }
```

with:

```js
        let totalLine;
        if (_couponAplicado) {
            const discountAmount = Math.round(productsTotal * _couponAplicado.percent / 100);
            const finalTotal = subtotal - discountAmount;
            const totalLabel = mode === 'transfer' ? 'Total a transferir' : 'Total';
            totalLine =
                `<li><span>Subtotal</span><span>${formatMoney(subtotal)}</span></li>` +
                `<li class="volt-summary-discount"><span>Cupón ${_couponAplicado.code} (−${_couponAplicado.percent}%)</span><span>−${formatMoney(discountAmount)}</span></li>` +
                `<li class="volt-summary-total-transfer"><span><strong>${totalLabel}</strong></span><span><strong>${formatMoney(finalTotal)}</strong></span></li>`;
        } else if (mode === 'transfer') {
            const discountAmount = Math.round(subtotal * TRANSFER_DISCOUNT);
            const finalTotal = subtotal - discountAmount;
            totalLine =
                `<li><span>Subtotal</span><span>${formatMoney(subtotal)}</span></li>` +
                `<li class="volt-summary-discount"><span>Descuento transferencia (−10%)</span><span>−${formatMoney(discountAmount)}</span></li>` +
                `<li class="volt-summary-total-transfer"><span><strong>Total a transferir</strong></span><span><strong>${formatMoney(finalTotal)}</strong></span></li>`;
        } else {
            totalLine = `<li><span><strong>Total</strong></span><span><strong>${formatMoney(subtotal)}</strong></span></li>`;
        }
```

- [ ] **Step 8: Reset coupon state when the modal opens**

In `askCheckoutData`, right after `_shippingConfirmado = null;` (currently line 511), add:

```js
        _couponAplicado = null;
        const couponInputReset = modalEl.querySelector("#checkoutCouponInput");
        const couponFeedbackReset = modalEl.querySelector("#checkoutCouponFeedback");
        const couponRemoveReset = modalEl.querySelector("#checkoutCouponRemove");
        if (couponInputReset) couponInputReset.value = "";
        if (couponFeedbackReset) { couponFeedbackReset.textContent = ""; couponFeedbackReset.className = "volt-coupon__feedback"; }
        if (couponRemoveReset) couponRemoveReset.classList.add("d-none");
```

- [ ] **Step 9: Wire apply/remove handlers inside the modal Promise**

In `askCheckoutData`, inside `return new Promise((resolve) => { ... })`, right after `const onHidden = () => { ... };` (ends at line 585), add:

```js
            const couponInput = modalEl.querySelector("#checkoutCouponInput");
            const couponApplyBtn = modalEl.querySelector("#checkoutCouponApply");
            const couponRemoveBtn = modalEl.querySelector("#checkoutCouponRemove");
            const couponFeedback = modalEl.querySelector("#checkoutCouponFeedback");

            const setCouponFeedback = (msg, ok) => {
                couponFeedback.textContent = msg || "";
                couponFeedback.classList.toggle("is-ok", !!ok && !!msg);
                couponFeedback.classList.toggle("is-error", !ok && !!msg);
            };

            const rerenderSummaryNow = () => {
                if (!_shippingConfirmado) return;
                const customer = {
                    name: modalEl.querySelector("#customerName").value.trim(),
                    dni: modalEl.querySelector("#customerDni").value.trim(),
                    phone: modalEl.querySelector("#customerPhone").value.trim(),
                    email: modalEl.querySelector("#customerEmail").value.trim(),
                };
                renderSummary(modalEl, cart, customer, _shippingConfirmado, mode);
            };

            const onCouponApply = async () => {
                const code = normalizeCouponCode(couponInput.value);
                if (!code) { setCouponFeedback("Ingresá un código.", false); return; }
                couponApplyBtn.disabled = true;
                setCouponFeedback("Validando…", true);
                try {
                    const snap = await firebase.firestore().collection("coupons").doc(code).get();
                    const data = snap.exists ? snap.data() : null;
                    const res = couponValidity(data);
                    if (!res.valid) {
                        _couponAplicado = null;
                        couponRemoveBtn.classList.add("d-none");
                        setCouponFeedback(res.reason, false);
                    } else {
                        _couponAplicado = { code: data.code || code, percent: res.percent };
                        couponRemoveBtn.classList.remove("d-none");
                        setCouponFeedback(`Cupón ${_couponAplicado.code} aplicado: ${res.percent}% off en productos.`, true);
                    }
                } catch (e) {
                    _couponAplicado = null;
                    couponRemoveBtn.classList.add("d-none");
                    setCouponFeedback("No se pudo validar el cupón. Probá de nuevo.", false);
                } finally {
                    couponApplyBtn.disabled = false;
                    rerenderSummaryNow();
                }
            };

            const onCouponRemove = () => {
                _couponAplicado = null;
                couponInput.value = "";
                couponRemoveBtn.classList.add("d-none");
                setCouponFeedback("", false);
                rerenderSummaryNow();
            };
```

- [ ] **Step 10: Register and clean up the new listeners**

In the same Promise, add the listeners next to the existing ones. After `btnPay.addEventListener("click", onPay);` (currently line 676), add:

```js
            couponApplyBtn.addEventListener("click", onCouponApply);
            couponRemoveBtn.addEventListener("click", onCouponRemove);
```

And in `cleanup` (currently lines 573–578), after `btnPay.removeEventListener("click", onPay);`, add:

```js
                couponApplyBtn.removeEventListener("click", onCouponApply);
                couponRemoveBtn.removeEventListener("click", onCouponRemove);
```

- [ ] **Step 11: Run test to verify it passes**

Run: `node tests/coupons-integration.test.mjs`
Expected: `✅ coupon integration checks passed`

- [ ] **Step 12: Manual smoke (browser)**

Run a local server (`npx serve .`) → abrir `pages/catalogo.html`, agregar un producto, ir al checkout, avanzar al paso 3. (Sin cupón cargado todavía, "Aplicar VOLT20" debe mostrar "No encontramos ese cupón." en rojo.) Verificá que NO rompe el resumen normal ni el flujo.

- [ ] **Step 13: Commit**

```bash
git add js/pagos.js tests/coupons-integration.test.mjs
git commit -m "feat(coupons): coupon input + client validation + live discount preview in checkout"
```

---

### Task 6: Checkout — enviar `couponCode` al backend y reflejarlo en WhatsApp

**Files:**
- Modify: `js/pagos.js`
- Test: `tests/coupons-integration.test.mjs` (append)

**Interfaces:**
- Consumes: `_couponAplicado` (Task 5), `buildTransferWaUrl(cart, customer, shippingState, serverTotals)` existente.
- Produces: `couponCode` en el payload de `onPay` y en el `postBody` de ambos fetch; línea de descuento del cupón en el mensaje de WhatsApp.

- [ ] **Step 1: Write the failing test**

Append to `tests/coupons-integration.test.mjs`, before the `if (failed > 0)` block:

```js
// ── pagos.js (envío al backend + WhatsApp) ──
inc('pagos arma payload con couponCode', pagosJs, 'payload.couponCode');
inc('pagos manda couponCode en postBody', pagosJs, 'postBody.couponCode');
inc('pagos WA muestra descuento cupón', pagosJs, 'Descuento cupón');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/coupons-integration.test.mjs`
Expected: FAIL — `pagos arma payload con couponCode: missing "payload.couponCode"`.

- [ ] **Step 3: Include the coupon in the resolved payload**

In `onPay`, right before `_shippingConfirmado = null;` (currently line 670), add:

```js
                payload.couponCode = _couponAplicado?.code || null;
```

- [ ] **Step 4: Send couponCode from the Mercado Pago handler**

In the `checkoutBtn` click handler, change the destructure (currently line 716):

```js
            const { customer, shippingOption, shipping } = result;
```

to:

```js
            const { customer, shippingOption, shipping, couponCode } = result;
```

Then, right after the `postBody` object is built and the `if (shipping?.address) { postBody.shipping = shipping; }` block (currently ends at line 742), add:

```js
            if (couponCode) postBody.couponCode = couponCode;
```

- [ ] **Step 5: Send couponCode from the transfer handler**

In the `transferBtn` click handler, change the destructure (currently line 819):

```js
                const { customer, shippingOption, shipping } = result;
```

to:

```js
                const { customer, shippingOption, shipping, couponCode } = result;
```

Then change the `postBody` line (currently lines 839–840):

```js
                const postBody = { items, customer, shippingOption };
                if (shipping?.address) postBody.shipping = shipping;
```

to:

```js
                const postBody = { items, customer, shippingOption };
                if (shipping?.address) postBody.shipping = shipping;
                if (couponCode) postBody.couponCode = couponCode;
```

- [ ] **Step 6: Pass discount metadata to the WhatsApp builder**

In the transfer handler, change the `buildTransferWaUrl` call (currently lines 865–870):

```js
                const waUrl = buildTransferWaUrl(cart, customer, shippingState, {
                    orderId: data.orderId,
                    subtotal: data.subtotal,
                    discountAmount: data.discountAmount,
                    total: data.total,
                });
```

to:

```js
                const waUrl = buildTransferWaUrl(cart, customer, shippingState, {
                    orderId: data.orderId,
                    subtotal: data.subtotal,
                    discountAmount: data.discountAmount,
                    total: data.total,
                    discountSource: data.discountSource,
                    coupon: data.coupon,
                    discountPercent: data.discountPercent,
                });
```

- [ ] **Step 7: Show the coupon line in the WhatsApp message**

In `buildTransferWaUrl`, replace the discount line inside the `msg` array (currently line 466):

```js
            `*Descuento 10% transferencia:* −${formatMoney(discountAmount)}`,
```

with:

```js
            serverTotals.discountSource === 'coupon'
                ? `*Descuento cupón ${serverTotals.coupon} (${serverTotals.discountPercent}%):* −${formatMoney(discountAmount)}`
                : `*Descuento 10% transferencia:* −${formatMoney(discountAmount)}`,
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `node tests/coupons-integration.test.mjs && node tests/transfer-flow.test.js`
Expected: both print `✅ ... passed` (transfer-flow still passes — `buildTransferWaUrl`, `orderId: data.orderId`, `Orden #${orderId}` unchanged).

- [ ] **Step 9: Commit**

```bash
git add js/pagos.js tests/coupons-integration.test.mjs
git commit -m "feat(coupons): send couponCode to both checkout endpoints + coupon line in WhatsApp"
```

---

### Task 7: Admin — tab "Cupones" + módulo de gestión

**Files:**
- Create: `js/admin-coupons.js`
- Modify: `admin/panel.html`
- Modify: `js/admin-ui.js`
- Test: `tests/coupons-integration.test.mjs` (append)

**Interfaces:**
- Consumes: `firebase.firestore()` compat (ya cargado en `panel.html`), patrón de tabs `data-tab`/`tab-<id>` de `admin-ui.js`.
- Produces: módulo `AdminCoupons` con `init()`, `loadCoupons()`, `createCoupon()`; colección `coupons` administrada (crear/activar/desactivar/borrar).

- [ ] **Step 1: Write the failing test**

Append to `tests/coupons-integration.test.mjs`, before the `if (failed > 0)` block:

```js
// ── admin ──
const adminHtml = read('admin/panel.html');
inc('admin tab cupones', adminHtml, 'data-tab="cupones"');
inc('admin tab-content cupones', adminHtml, 'id="tab-cupones"');
inc('admin importa admin-coupons', adminHtml, 'admin-coupons.js');
const adminUiJs = read('js/admin-ui.js');
inc('admin-ui carga cupones en tab', adminUiJs, "tabId === 'cupones'");
const adminCouponsJs = read('js/admin-coupons.js');
inc('admin-coupons usa colección coupons', adminCouponsJs, "collection('coupons')");
inc('admin-coupons exporta loadCoupons', adminCouponsJs, 'export async function loadCoupons');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/coupons-integration.test.mjs`
Expected: FAIL — `admin tab cupones: missing "data-tab="cupones""`.

- [ ] **Step 3: Create the admin module**

Create `js/admin-coupons.js`:

```js
/**
 * VOLT Admin — Cupones de descuento.
 * Colección Firestore `coupons` (doc id = código normalizado). Firebase compat.
 */

function normalizeCouponCode(code) {
    return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

const db = () => firebase.firestore();

function renderRow(doc) {
    const c = doc.data();
    const active = c.active === true;
    const expires = c.expiresAt && typeof c.expiresAt.toDate === 'function'
        ? c.expiresAt.toDate().toLocaleDateString('es-AR')
        : '—';
    return `<tr>
        <td>${c.code}</td>
        <td>${c.percent}%</td>
        <td>${active ? 'Activo' : 'Inactivo'}</td>
        <td>${expires}</td>
        <td>
            <button class="btn btn-sm btn-outline-light me-1" data-coupon-toggle="${doc.id}">${active ? 'Desactivar' : 'Activar'}</button>
            <button class="btn btn-sm" style="background:#780000;color:#fff;border:none;" data-coupon-delete="${doc.id}">Borrar</button>
        </td>
    </tr>`;
}

function bindRowActions(tbody) {
    tbody.querySelectorAll('[data-coupon-toggle]').forEach((b) =>
        b.addEventListener('click', () => toggleCoupon(b.getAttribute('data-coupon-toggle'))));
    tbody.querySelectorAll('[data-coupon-delete]').forEach((b) =>
        b.addEventListener('click', () => deleteCoupon(b.getAttribute('data-coupon-delete'))));
}

export async function loadCoupons() {
    const tbody = document.getElementById('couponsTable');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5">Cargando…</td></tr>';
    try {
        const snap = await db().collection('coupons').orderBy('createdAt', 'desc').get();
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="5">Todavía no hay cupones.</td></tr>';
            return;
        }
        tbody.innerHTML = snap.docs.map(renderRow).join('');
        bindRowActions(tbody);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5">Error: ${e.message}</td></tr>`;
    }
}

export async function createCoupon() {
    const codeEl = document.getElementById('couponCodeInput');
    const percentEl = document.getElementById('couponPercentInput');
    const expiresEl = document.getElementById('couponExpiresInput');
    const code = normalizeCouponCode(codeEl.value);
    const percent = Number(percentEl.value);
    if (!code) { alert('Ingresá un código.'); return; }
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
        alert('El % debe ser un entero entre 1 y 100.');
        return;
    }
    const data = {
        code,
        percent,
        active: true,
        expiresAt: expiresEl && expiresEl.value
            ? firebase.firestore.Timestamp.fromDate(new Date(expiresEl.value + 'T23:59:59'))
            : null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    try {
        await db().collection('coupons').doc(code).set(data);
        codeEl.value = '';
        percentEl.value = '';
        if (expiresEl) expiresEl.value = '';
        await loadCoupons();
    } catch (e) {
        alert('No se pudo crear el cupón: ' + e.message);
    }
}

async function toggleCoupon(id) {
    const ref = db().collection('coupons').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return;
    await ref.update({
        active: !(snap.data().active === true),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await loadCoupons();
}

async function deleteCoupon(id) {
    if (!confirm(`¿Borrar el cupón ${id}? Esta acción es irreversible.`)) return;
    await db().collection('coupons').doc(id).delete();
    await loadCoupons();
}

export function init() {
    const form = document.getElementById('couponForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            createCoupon();
        });
    }
}
```

- [ ] **Step 4: Add the tab button**

In `admin/panel.html`, after the "Configuración" tab button (currently ends at line 812), add a new tab button before `</div>` (line 813):

```html
                <button class="admin-tab" data-tab="cupones"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>Cupones</button>
```

- [ ] **Step 5: Add the tab content**

In `admin/panel.html`, locate `<div class="tab-content" id="tab-configuracion">` and its matching closing `</div>` (it is the last `.tab-content` block, a sibling of `#tab-productos` / `#tab-pedidos`). Immediately after that closing `</div>`, at the same indentation as the other `.tab-content` blocks, add:

```html
            <!-- ============================================
                 TAB: CUPONES
            ============================================ -->
            <div class="tab-content" id="tab-cupones">
                <form id="couponForm" class="row g-2 align-items-end mb-4" style="max-width:640px;">
                    <div class="col-12 col-sm-4">
                        <label class="form-label" for="couponCodeInput">Código</label>
                        <input type="text" class="form-control" id="couponCodeInput" placeholder="VOLT20" autocomplete="off" style="text-transform:uppercase;">
                    </div>
                    <div class="col-6 col-sm-3">
                        <label class="form-label" for="couponPercentInput">% descuento</label>
                        <input type="number" class="form-control" id="couponPercentInput" min="1" max="100" step="1" placeholder="20">
                    </div>
                    <div class="col-6 col-sm-3">
                        <label class="form-label" for="couponExpiresInput">Vence (opcional)</label>
                        <input type="date" class="form-control" id="couponExpiresInput">
                    </div>
                    <div class="col-12 col-sm-2">
                        <button type="submit" class="btn btn-danger w-100">Crear</button>
                    </div>
                </form>
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr><th>Código</th><th>%</th><th>Estado</th><th>Vence</th><th>Acciones</th></tr>
                        </thead>
                        <tbody id="couponsTable">
                            <tr><td colspan="5">Cargando…</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
```

- [ ] **Step 6: Import and init the module**

In `admin/panel.html`, replace the inline module script (currently lines 1239–1246):

```html
    <script type="module">
        import * as AdminProducts from '/js/admin-products.js';
        import * as AdminOrders from '/js/admin-orders.js';
        import * as AdminUI from '/js/admin-ui.js';

        AdminUI.init({ AdminProducts, AdminOrders });
        window.VoltAdminAuth.init();
    </script>
```

with:

```html
    <script type="module">
        import * as AdminProducts from '/js/admin-products.js';
        import * as AdminOrders from '/js/admin-orders.js';
        import * as AdminCoupons from '/js/admin-coupons.js';
        import * as AdminUI from '/js/admin-ui.js';

        AdminUI.init({ AdminProducts, AdminOrders, AdminCoupons });
        AdminCoupons.init();
        window.VoltAdminAuth.init();
    </script>
```

- [ ] **Step 7: Load coupons when the tab opens**

In `js/admin-ui.js`, inside the tab click handler, after the existing `if (tabId === 'pedidos') { ... }` block (currently lines 45–47), add:

```js
            if (tabId === 'cupones') {
                state.deps.AdminCoupons.loadCoupons();
            }
```

- [ ] **Step 8: Run test to verify it passes**

Run: `node tests/coupons-integration.test.mjs`
Expected: `✅ coupon integration checks passed`

- [ ] **Step 9: Commit**

```bash
git add js/admin-coupons.js admin/panel.html js/admin-ui.js tests/coupons-integration.test.mjs
git commit -m "feat(coupons): admin tab to create/activate/deactivate/delete coupons"
```

---

### Task 8: Verificación final + deploy de reglas + alta de VOLT20

**Files:** ninguno (verificación y operación).

- [ ] **Step 1: Run the full test suite**

Run: `node tests/coupons.test.mjs && node tests/coupons-integration.test.mjs && node tests/transfer-flow.test.js`
Expected: las tres líneas `✅ ... passed`.

- [ ] **Step 2: Deploy de reglas Firestore**

Las reglas nuevas (`coupons`) deben publicarse para que el cliente pueda leer cupones y el admin escribirlos. Con Firebase CLI: `firebase deploy --only firestore:rules` (o pegarlas en la consola de Firebase). Confirmá que `match /coupons/{couponId}` quedó publicada.

- [ ] **Step 3: Manual end-to-end (browser)**

1. Deploy del sitio (Vercel) o `vercel dev` local con env vars de Firebase/MP.
2. Panel admin → tab **Cupones** → crear `VOLT20`, 20%, sin vencimiento. Verificá que aparece como **Activo**.
3. Catálogo → agregar producto → checkout → paso 3 → escribir `volt20` → **Aplicar**: debe mostrar "Cupón VOLT20 aplicado: 20% off en productos." y el resumen recalcular (Subtotal / Cupón VOLT20 (−20%) / Total).
4. **Transferencia:** confirmar que el total y el mensaje de WhatsApp muestran "Descuento cupón VOLT20 (20%)" en vez del 10%.
5. **Mercado Pago:** confirmar que el `init_point` cobra el monto con −20% en productos (envío Córdoba a precio completo).
6. **Admin → Desactivar VOLT20** → reintentar en checkout: el cupón debe rechazarse ("Ese cupón no está activo.").

- [ ] **Step 4: Verificación de "no acumulable" (revisión de orden)**

En el panel de Pedidos, abrí una orden creada con cupón y confirmá que `discountSource: 'coupon'`, `discountPercent: 20`, y que NO se aplicó además el 10% (el `discountAmount` = 20% de productos, no 10% de subtotal + 20%).

---

## Notas de cobertura del spec

- **Emails:** el spec mencionaba adaptar la línea de descuento en el email. En la práctica `api/notify-status.js` solo muestra `Total` (el total final ya refleja el cupón), sin desglose de descuento, así que **no requiere cambios**. No se agregó tarea.
- **Límite de usos / monto fijo / cupón por usuario:** fuera de alcance (ver spec, sección "Fuera de alcance").
