# Páginas de producto (SEO) + Checkout invitado + DNI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generar páginas HTML estáticas por producto con JSON-LD (build step en Vercel), permitir checkout sin cuenta, y persistir el DNI en la orden.

**Architecture:** Un script Node corre en el build de Vercel, lee Firestore con `firebase-admin` y emite `/producto/{slug}-{id}.html` + `sitemap.xml`. Las páginas son landings de SEO que deep-linkean al quick-view del catálogo existente y se hidratan (precio/stock) en vivo. El admin dispara redeploys vía un endpoint serverless protegido. Checkout y DNI son cambios acotados en `pagos.js` y los dos endpoints de orden.

**Tech Stack:** HTML/CSS/JS vanilla, Node ESM (`.mjs`) para scripts, `firebase-admin` (ya en deps), Firebase compat 9.22 vía CDN para hidratación, Vercel (build command + deploy hook).

## Global Constraints

- Rojo canónico: `#c1121f` (único rojo permitido).
- Sin bundler ni framework de build. Scripts nuevos son Node ESM (`.mjs`).
- Firebase en el navegador: compat SDK **9.22** desde `https://www.gstatic.com/firebasejs/9.22.0/*`.
- Tests: Node plano + `node:assert`, sin framework, un archivo por preocupación. Se corren con `node tests/<archivo>`.
- Env disponibles en build time de Vercel: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `SITE_URL`.
- Las páginas de producto se sirven desde `/producto/` en la raíz del sitio (`outputDirectory: "."`).
- Dominio canónico: `https://voltculture.com.ar` (sin `www` en canonical/JSON-LD, alineado al `sitemap.xml` actual).
- `SITE_URL` puede venir con `www`; normalizar sacando barra final antes de concatenar.

---

### Task 1: Persistir y validar DNI en las órdenes (N6)

**Files:**
- Modify: `api/create-preference.js` (validación ~línea 159, guardado del `customer` ~línea 268)
- Modify: `api/create-transfer-order.js` (validación ~línea 150, guardado del `customer` ~línea 260)
- Test: `tests/dni-guest.test.mjs` (nuevo, estructural — mismo estilo que `tests/coupons-integration.test.mjs`)

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces: las órdenes en Firestore ahora tienen `customer.dni` (string de 7-8 dígitos). Consumido conceptualmente por el panel/emails, no por otra tarea de este plan.

- [ ] **Step 1: Write the failing test** — `tests/dni-guest.test.mjs`

```javascript
/**
 * Checks estructurales: DNI persistido/validado (N6) y checkout sin login (N2).
 * Uso: node tests/dni-guest.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
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

if (failed) { console.error(`\n❌ ${failed} check(s) fallaron`); process.exit(1); }
console.log('✅ dni/guest checks passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/dni-guest.test.mjs`
Expected: FAIL — `create-preference.js valida DNI: falta "/^\d{7,8}$/"` (y análogos).

- [ ] **Step 3: Add DNI validation and storage in `api/create-preference.js`**

Después del bloque que valida `customer?.name || customer?.phone || customer?.email` (busca `Faltan datos del cliente`), agregar la validación de DNI:

```javascript
        const dni = String(customer?.dni || '').trim();
        if (!/^\d{7,8}$/.test(dni)) {
            return res.status(400).json({ error: 'DNI inválido: debe tener 7 u 8 dígitos, sin puntos ni espacios.' });
        }
```

Y en el `orderRef.set({...})`, agregar `dni` al objeto `customer` (que hoy tiene name/phone/email):

```javascript
                customer: {
                    name: String(customer.name).trim(),
                    phone: String(customer.phone).trim(),
                    email: String(customer.email).trim(),
                    dni
                },
```

- [ ] **Step 4: Add DNI validation and storage in `api/create-transfer-order.js`**

Mismo cambio, tras el bloque `Faltan datos del cliente`:

```javascript
        const dni = String(customer?.dni || '').trim();
        if (!/^\d{7,8}$/.test(dni)) {
            return res.status(400).json({ error: 'DNI inválido: debe tener 7 u 8 dígitos, sin puntos ni espacios.' });
        }
```

Y en el `orderRef.set({...})`, agregar `dni` al `customer`:

```javascript
                customer: {
                    name: String(customer.name).trim(),
                    phone: String(customer.phone).trim(),
                    email: String(customer.email).trim(),
                    dni
                },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node tests/dni-guest.test.mjs`
Expected: PASS — `✅ dni/guest checks passed` (los checks N2 se agregan en la Task 2; por ahora este test solo cubre N6 y ya debería pasar sus asserts de DNI).

- [ ] **Step 6: Syntax-check both endpoints**

Run: `node --check api/create-preference.js && node --check api/create-transfer-order.js`
Expected: sin salida (exit 0).

- [ ] **Step 7: Commit**

```bash
git add api/create-preference.js api/create-transfer-order.js tests/dni-guest.test.mjs
git commit -m "feat(checkout): persistir y validar DNI en las órdenes (N6)"
```

---

### Task 2: Checkout invitado — quitar gate de login (N2)

**Files:**
- Modify: `js/pagos.js` (bloque `requireAuth` en el handler de `checkout-btn` ~línea 821, y en el de `transfer-btn` ~línea 931)
- Test: `tests/dni-guest.test.mjs` (extender)

**Interfaces:**
- Consumes: nada.
- Produces: el flujo de compra ya no exige sesión. Sin API nueva.

- [ ] **Step 1: Extend the failing test** — agregar al final de `tests/dni-guest.test.mjs`, ANTES del bloque `if (failed)`:

```javascript
// N2 — pagos.js no debe exigir login para comprar
const pagos = read('js/pagos.js');
exc('pagos.js sin gate requireAuth', pagos, 'requireAuth');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/dni-guest.test.mjs`
Expected: FAIL — `pagos.js sin gate requireAuth: no debería contener "requireAuth"`.

- [ ] **Step 3: Remove the login gate from the MP checkout handler**

En `js/pagos.js`, dentro del listener de `checkoutBtn` (`checkoutBtn.addEventListener("click", ...)`), eliminar por completo este bloque:

```javascript
        if (window.VoltStoreAuth) {
            const user = await window.VoltStoreAuth.requireAuth();
            if (!user) return;
        }
```

- [ ] **Step 4: Remove the login gate from the transfer handler**

En el listener de `transferBtn` (`transferBtn.addEventListener("click", ...)`), eliminar el bloque idéntico:

```javascript
            if (window.VoltStoreAuth) {
                const user = await window.VoltStoreAuth.requireAuth();
                if (!user) return;
            }
```

(No tocar nada más: el pre-llenado del modal con `window.VoltStoreAuth?.getCurrentUser()` y el `firebase.auth().currentUser?.uid` para el carrito ya manejan el caso sin sesión.)

- [ ] **Step 5: Run test + syntax check**

Run: `node tests/dni-guest.test.mjs && node --check js/pagos.js`
Expected: `✅ dni/guest checks passed` y sin errores de sintaxis.

- [ ] **Step 6: Commit**

```bash
git add js/pagos.js tests/dni-guest.test.mjs
git commit -m "feat(checkout): permitir compra sin cuenta (N2)"
```

---

### Task 3: Helpers puros del template — slugify, imágenes, sitemap

**Files:**
- Create: `scripts/product-page-template.mjs`
- Test: `tests/product-page.test.mjs` (nuevo)

**Interfaces:**
- Consumes: nada.
- Produces (exports de `scripts/product-page-template.mjs`):
  - `slugify(name: string) -> string`
  - `productPath(product: {name, id}) -> string` (ej. `/producto/hoodie-f1-negro-a1b2c3.html`)
  - `buildImageArray(product, siteUrl: string) -> string[]` (URLs absolutas, deduplicadas)
  - `buildSitemap(products: object[], siteUrl: string) -> string` (XML)
  - `renderProductPage` se agrega en la Task 4 (mismo archivo).

- [ ] **Step 1: Write the failing test** — `tests/product-page.test.mjs`

```javascript
/**
 * Tests del módulo de template de páginas de producto.
 * Uso: node tests/product-page.test.mjs
 */
import assert from 'node:assert';
import { slugify, productPath, buildImageArray, buildSitemap } from '../scripts/product-page-template.mjs';

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

console.log('✅ product-page helper checks passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/product-page.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/product-page-template.mjs'`.

- [ ] **Step 3: Create `scripts/product-page-template.mjs` with the helpers**

```javascript
/**
 * Template + helpers para páginas de producto (SEO). Funciones puras, testeables.
 */

export function slugify(name) {
    return String(name || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'producto';
}

export function productPath(product) {
    return `/producto/${slugify(product.name)}-${product.id}.html`;
}

function toAbsolute(url, siteUrl) {
    const u = String(url || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    return siteUrl.replace(/\/$/, '') + '/' + u.replace(/^\//, '');
}

export function buildImageArray(product, siteUrl) {
    const out = [];
    const push = (v) => {
        const abs = toAbsolute(v, siteUrl);
        if (abs && !out.includes(abs)) out.push(abs);
    };
    push(product.image || product.imageUrl);
    if (Array.isArray(product.images)) {
        for (const img of product.images) {
            if (typeof img === 'string') push(img);
            else if (img && typeof img === 'object') push(img.url || img.src);
        }
    }
    for (const map of [product.variantImages, product.imagesByColor]) {
        if (map && typeof map === 'object') {
            for (const v of Object.values(map)) {
                if (typeof v === 'string') push(v);
                else if (v && typeof v === 'object') push(v.url || v.src);
            }
        }
    }
    return out;
}

const STATIC_URLS = [
    { loc: '/', changefreq: 'weekly', priority: '1.0' },
    { loc: '/pages/catalogo.html', changefreq: 'daily', priority: '0.95' },
    { loc: '/pages/about.html', changefreq: 'monthly', priority: '0.7' },
    { loc: '/pages/envios.html', changefreq: 'monthly', priority: '0.75' },
    { loc: '/pages/novedades.html', changefreq: 'weekly', priority: '0.65' }
];

export function buildSitemap(products, siteUrl) {
    const base = siteUrl.replace(/\/$/, '');
    const entry = (loc, cf, pr) =>
        `  <url>\n    <loc>${base}${loc}</loc>\n    <changefreq>${cf}</changefreq>\n    <priority>${pr}</priority>\n  </url>`;
    const urls = STATIC_URLS.map((u) => entry(u.loc, u.changefreq, u.priority));
    for (const p of products) urls.push(entry(productPath(p), 'weekly', '0.8'));
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/product-page.test.mjs`
Expected: PASS — `✅ product-page helper checks passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/product-page-template.mjs tests/product-page.test.mjs
git commit -m "feat(seo): helpers puros de template de producto (slug, imágenes, sitemap)"
```

---

### Task 4: `renderProductPage` — HTML con JSON-LD e hidratación

**Files:**
- Modify: `scripts/product-page-template.mjs` (agregar `renderProductPage`)
- Test: `tests/product-page.test.mjs` (extender)

**Interfaces:**
- Consumes: `slugify`, `productPath`, `buildImageArray` (Task 3).
- Produces: `renderProductPage(product, { siteUrl }) -> string` (HTML completo). Usado por `generate` (Task 5).

- [ ] **Step 1: Extend the failing test** — agregar en `tests/product-page.test.mjs`, antes del `console.log` final:

```javascript
import { renderProductPage } from '../scripts/product-page-template.mjs';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/product-page.test.mjs`
Expected: FAIL — `renderProductPage is not a function` (o import undefined).

- [ ] **Step 3: Add `renderProductPage` to `scripts/product-page-template.mjs`**

Agregar al final del archivo:

```javascript
function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function aggregateStock(product) {
    const v = Array.isArray(product.variants) ? product.variants.reduce((n, x) => n + (Number(x.stock) || 0), 0) : 0;
    const s = Array.isArray(product.sizes) ? product.sizes.reduce((n, x) => n + (Number(x.stock) || 0), 0) : 0;
    if (v > 0) return v;
    if (s > 0) return s;
    return Number(product.stock) || 0;
}

export function renderProductPage(product, { siteUrl }) {
    const base = siteUrl.replace(/\/$/, '');
    const url = base + productPath(product);
    const images = buildImageArray(product, siteUrl);
    const mainImage = images[0] || `${base}/images-brand/Isotipo color.png`;
    const price = Number(product.price) || 0;
    const inStock = aggregateStock(product) > 0;
    const desc = String(product.description
        || `${product.name} — VOLT Culture. Streetwear inspirado en el motorsport, desde Córdoba.`).trim();

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name || 'Producto VOLT',
        description: desc,
        image: images.length ? images : [mainImage],
        sku: String(product.id),
        mpn: String(product.id),
        brand: { '@type': 'Brand', name: 'VOLT' },
        offers: {
            '@type': 'Offer',
            price: String(price),
            priceCurrency: 'ARS',
            availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            url
        }
    };

    const colorDots = (Array.isArray(product.variants) ? product.variants : [])
        .map((v) => `<span class="pp-swatch" style="background:${esc(v.hex || '#44464c')}" title="${esc(v.color || '')}"></span>`).join('');
    const sizeTags = (Array.isArray(product.sizes) ? product.sizes : [])
        .map((s) => `<span class="pp-size">${esc(s.size || '')}</span>`).join('');

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(product.name)} · VOLT Culture</title>
<meta name="description" content="${esc(desc.slice(0, 160))}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="product">
<meta property="og:title" content="${esc(product.name)} · VOLT">
<meta property="og:description" content="${esc(desc.slice(0, 160))}">
<meta property="og:image" content="${esc(mainImage)}">
<meta property="og:url" content="${url}">
<link rel="icon" href="/images-brand/Isotipo color.png" type="image/png">
<link href="/css/volt-ds.css" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
  body{background:#000;color:#fff;font-family:'Glacial Indifference',sans-serif;margin:0}
  .pp-nav{padding:1rem 1.5rem;border-bottom:1px solid rgba(255,255,255,.1)}
  .pp-nav a{color:#fff;text-decoration:none;font-family:'Teko',sans-serif;font-size:1.5rem;letter-spacing:.1em}
  .pp-wrap{max-width:960px;margin:0 auto;padding:2rem 1.5rem;display:grid;gap:2rem;grid-template-columns:1fr}
  @media(min-width:768px){.pp-wrap{grid-template-columns:1fr 1fr}}
  .pp-img img{width:100%;height:auto;display:block;border:1px solid rgba(255,255,255,.08)}
  .pp-title{font-family:'Teko',sans-serif;font-size:2.5rem;line-height:1;text-transform:uppercase;margin:0 0 .5rem}
  .pp-price{font-size:1.5rem;color:#c1121f;font-weight:700;margin:0 0 1rem}
  .pp-desc{color:#bbb;line-height:1.6;margin:0 0 1.5rem}
  .pp-row{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;margin:0 0 1rem}
  .pp-swatch{width:22px;height:22px;border:1px solid #444;display:inline-block}
  .pp-size{border:1px solid #444;padding:.2rem .55rem;font-size:.85rem}
  .pp-cta{display:inline-block;background:#c1121f;color:#fff;text-decoration:none;padding:.85rem 1.5rem;font-family:'Teko',sans-serif;font-size:1.3rem;letter-spacing:.06em}
  .pp-foot{padding:2rem 1.5rem;border-top:1px solid rgba(255,255,255,.1);color:#666;font-size:.8rem;text-align:center}
</style>
</head>
<body>
<nav class="pp-nav"><a href="/">⚡ VOLT</a></nav>
<main class="pp-wrap">
  <div class="pp-img"><img src="${esc(mainImage)}" alt="${esc(product.name)}"></div>
  <div class="pp-info">
    <h1 class="pp-title">${esc(product.name)}</h1>
    <p class="pp-price" data-pp-price>$${price.toLocaleString('es-AR')}</p>
    <p class="pp-desc">${esc(desc)}</p>
    ${colorDots ? `<div class="pp-row">${colorDots}</div>` : ''}
    ${sizeTags ? `<div class="pp-row">${sizeTags}</div>` : ''}
    <p data-pp-availability>${inStock ? 'En stock' : 'Sin stock'}</p>
    <a class="pp-cta" href="/pages/catalogo.html?product=${esc(product.id)}">Comprar &rarr;</a>
  </div>
</main>
<footer class="pp-foot">VOLT — Motorsport Culture · Córdoba, Argentina</footer>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
<script src="/js/firebase-config.js"></script>
<script>
  (function () {
    try {
      if (!window.FirebaseConfig || !window.FirebaseConfig.init()) return;
      firebase.firestore().collection('products').doc(${JSON.stringify(String(product.id))}).get().then(function (snap) {
        if (!snap.exists) return;
        var d = snap.data();
        var priceEl = document.querySelector('[data-pp-price]');
        if (priceEl && Number(d.price)) priceEl.textContent = '$' + Number(d.price).toLocaleString('es-AR');
        var stock = 0;
        if (Array.isArray(d.variants)) stock = d.variants.reduce(function (n, x) { return n + (Number(x.stock) || 0); }, 0);
        if (!stock && Array.isArray(d.sizes)) stock = d.sizes.reduce(function (n, x) { return n + (Number(x.stock) || 0); }, 0);
        if (!stock) stock = Number(d.stock) || 0;
        var availEl = document.querySelector('[data-pp-availability]');
        if (availEl) availEl.textContent = stock > 0 ? 'En stock' : 'Sin stock';
      }).catch(function () {});
    } catch (e) {}
  })();
</script>
</body>
</html>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/product-page.test.mjs`
Expected: PASS — `✅ product-page helper checks passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/product-page-template.mjs tests/product-page.test.mjs
git commit -m "feat(seo): renderProductPage con JSON-LD Product + hidratación en vivo"
```

---

### Task 5: Script generador — `scripts/gen-product-pages.mjs`

**Files:**
- Create: `scripts/gen-product-pages.mjs`
- Test: `tests/gen-product-pages.test.mjs` (nuevo)

**Interfaces:**
- Consumes: `renderProductPage`, `buildSitemap`, `slugify` (Tasks 3-4).
- Produces:
  - `generate(products, { productsDir, sitemapPath, siteUrl }) -> number` (cantidad de páginas escritas). Exportado y testeable.
  - `main()` que inicializa `firebase-admin` desde env, lee productos activos y llama a `generate`. Se ejecuta al invocar el script directamente.

- [ ] **Step 1: Write the failing test** — `tests/gen-product-pages.test.mjs`

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/gen-product-pages.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/gen-product-pages.mjs'`.

- [ ] **Step 3: Create `scripts/gen-product-pages.mjs`**

```javascript
/**
 * Genera /producto/{slug}-{id}.html + sitemap.xml desde Firestore.
 * Corre en el build de Vercel (buildCommand) y también local:
 *   node scripts/gen-product-pages.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderProductPage, buildSitemap, slugify } from './product-page-template.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export function generate(products, { productsDir, sitemapPath, siteUrl }) {
    fs.mkdirSync(productsDir, { recursive: true });
    let count = 0;
    for (const p of products) {
        try {
            const html = renderProductPage(p, { siteUrl });
            fs.writeFileSync(path.join(productsDir, `${slugify(p.name)}-${p.id}.html`), html, 'utf8');
            count++;
        } catch (e) {
            console.error(`[gen] Producto ${p.id} omitido:`, e.message);
        }
    }
    fs.writeFileSync(sitemapPath, buildSitemap(products, siteUrl), 'utf8');
    return count;
}

async function initAdminDb() {
    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');

    let credential;
    const projectId = (process.env.FIREBASE_PROJECT_ID || '').replace(/^"|"$/g, '').trim();
    const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').replace(/^"|"$/g, '').trim();
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/^"|"$/g, '').trim();

    if (projectId && clientEmail && privateKey) {
        credential = cert({ projectId, clientEmail, privateKey });
    } else {
        const keyPath = path.join(ROOT, 'scripts', 'serviceAccountKey.json');
        if (!fs.existsSync(keyPath)) {
            throw new Error('Sin credenciales: definí FIREBASE_* o scripts/serviceAccountKey.json');
        }
        credential = cert(JSON.parse(fs.readFileSync(keyPath, 'utf8')));
    }

    if (!getApps().length) initializeApp({ credential });
    return getFirestore();
}

async function main() {
    const db = await initAdminDb();
    const snap = await db.collection('products').where('active', '==', true).get();
    const products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const siteUrl = (process.env.SITE_URL || 'https://voltculture.com.ar').replace(/^"|"$/g, '').trim();
    const count = generate(products, {
        productsDir: path.join(ROOT, 'producto'),
        sitemapPath: path.join(ROOT, 'sitemap.xml'),
        siteUrl
    });
    console.log(`[gen] ${count} páginas de producto generadas`);
}

// Ejecuta main() solo si se invoca directamente (no al importarlo en tests).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((e) => {
        console.error('[gen] Build de páginas de producto FALLÓ:', e.message);
        process.exit(1);
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/gen-product-pages.test.mjs`
Expected: PASS — `✅ gen-product-pages checks passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/gen-product-pages.mjs tests/gen-product-pages.test.mjs
git commit -m "feat(seo): script generador de páginas de producto + sitemap"
```

---

### Task 6: Deep-link del catálogo — abrir quick-view por `?product=id`

**Files:**
- Modify: `js/catalog.js` (declarar flag cerca de `let activeQuickView = null;` ~línea 562; abrir en `loadProducts` tras renderizar, ~línea 64)
- Test: `tests/dni-guest.test.mjs` (extender con un check estructural)

**Interfaces:**
- Consumes: `openQuickView(product)` (ya existe en `catalog.js`).
- Produces: al entrar a `/pages/catalogo.html?product={id}`, se abre el quick-view de ese producto.

- [ ] **Step 1: Extend the failing test** — agregar en `tests/dni-guest.test.mjs`, antes del bloque `if (failed)`:

```javascript
// SEO1 — catálogo abre quick-view por ?product=
const catalog = read('js/catalog.js');
inc('catalog lee ?product', catalog, "get('product')");
inc('catalog abre quick-view del deep-link', catalog, 'openQuickView');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/dni-guest.test.mjs`
Expected: FAIL — `catalog lee ?product: falta "get('product')"`.

- [ ] **Step 3: Add the deep-link flag** — en `js/catalog.js`, cerca del inicio del callback `DOMContentLoaded` (junto a otras variables de estado como `filterState`), agregar:

```javascript
    let deepLinkHandled = false;
```

- [ ] **Step 4: Open the quick-view after products render** — en `loadProducts`, justo después del `products.forEach((product, index) => { ... productGrid.appendChild(card); });` (dentro del `else` que renderiza productos), agregar:

```javascript
                if (!deepLinkHandled) {
                    deepLinkHandled = true;
                    const wantedId = new URLSearchParams(location.search).get('product');
                    if (wantedId) {
                        const target = products.find((x) => String(x.id) === wantedId);
                        if (target) openQuickView(target);
                    }
                }
```

- [ ] **Step 5: Run test + syntax check**

Run: `node tests/dni-guest.test.mjs && node --check js/catalog.js`
Expected: `✅ dni/guest checks passed` y sin errores de sintaxis.

- [ ] **Step 6: Commit**

```bash
git add js/catalog.js tests/dni-guest.test.mjs
git commit -m "feat(seo): abrir quick-view del catálogo vía ?product= (deep-link)"
```

---

### Task 7: Integración Vercel — build command + output dir + gitignore

**Files:**
- Modify: `vercel.json` (agregar `buildCommand` y `outputDirectory`)
- Modify: `.gitignore` (agregar `producto/`)
- Test: `tests/dni-guest.test.mjs` (extender)

**Interfaces:**
- Consumes: `scripts/gen-product-pages.mjs` (Task 5).
- Produces: en cada deploy, Vercel corre el generador y sirve `/producto/*.html` desde la raíz.

- [ ] **Step 1: Extend the failing test** — agregar en `tests/dni-guest.test.mjs`, antes del bloque `if (failed)`:

```javascript
// SEO1 — vercel.json corre el generador en build
const vercelJson = read('vercel.json');
inc('vercel.json tiene buildCommand del generador', vercelJson, 'gen-product-pages.mjs');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/dni-guest.test.mjs`
Expected: FAIL — `vercel.json tiene buildCommand del generador: falta "gen-product-pages.mjs"`.

- [ ] **Step 3: Add build config to `vercel.json`** — agregar estas dos claves de nivel superior (junto a `"version": 2`), al inicio del objeto:

```json
  "buildCommand": "node scripts/gen-product-pages.mjs",
  "outputDirectory": ".",
```

El archivo debe quedar, por ejemplo:

```json
{
  "version": 2,
  "buildCommand": "node scripts/gen-product-pages.mjs",
  "outputDirectory": ".",
  "rewrites": [
```

(el resto de `vercel.json` no cambia).

- [ ] **Step 4: Ignore generated pages** — agregar a `.gitignore`:

```
# Páginas de producto generadas en build (SEO)
producto/
```

- [ ] **Step 5: Run test + validate JSON**

Run: `node tests/dni-guest.test.mjs && node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('vercel.json OK')"`
Expected: `✅ dni/guest checks passed` y `vercel.json OK`.

- [ ] **Step 6: Commit**

```bash
git add vercel.json .gitignore tests/dni-guest.test.mjs
git commit -m "feat(seo): build step en Vercel para páginas de producto"
```

> **Verificación en preview (manual, no automatizable):** tras mergear, abrir el **preview deployment** de Vercel y confirmar que (a) `/` y `/pages/catalogo.html` siguen sirviéndose, (b) existe `/producto/<algún-producto>.html` con su JSON-LD, y (c) `/sitemap.xml` incluye las URLs de producto. Solo promover a producción si esto pasa. Si `outputDirectory: "."` rompe el serve, revisar la config de output del proyecto en Vercel.

---

### Task 8: Endpoint de redeploy protegido — `api/admin-redeploy.js`

**Files:**
- Create: `api/admin-redeploy.js`
- Test: `tests/dni-guest.test.mjs` (extender)

**Interfaces:**
- Consumes: `verifyAdmin(req, res)` (ya existe en `api/_verify-admin.js`).
- Produces: `POST /api/admin-redeploy` con `Authorization: Bearer <idToken admin>` dispara el Deploy Hook de Vercel. Consumido por el admin (Task 9). Requiere env `VERCEL_DEPLOY_HOOK_URL`.

- [ ] **Step 1: Extend the failing test** — agregar en `tests/dni-guest.test.mjs`, antes del bloque `if (failed)`:

```javascript
// SEO1 — endpoint de redeploy protegido (reusa fs/path/root/read/inc del top)
const redeployPath = path.join(root, 'api/admin-redeploy.js');
if (!fs.existsSync(redeployPath)) {
    console.error('FAIL — no se creó api/admin-redeploy.js');
    failed++;
} else {
    const redeploy = read('api/admin-redeploy.js');
    inc('redeploy usa verifyAdmin', redeploy, 'verifyAdmin');
    inc('redeploy lee VERCEL_DEPLOY_HOOK_URL', redeploy, 'VERCEL_DEPLOY_HOOK_URL');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/dni-guest.test.mjs`
Expected: FAIL — `existe api/admin-redeploy.js` y los checks siguientes fallan.

- [ ] **Step 3: Create `api/admin-redeploy.js`**

```javascript
import { verifyAdmin } from './_verify-admin.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const decoded = await verifyAdmin(req, res);
    if (!decoded) return;

    const hook = (process.env.VERCEL_DEPLOY_HOOK_URL || '').trim();
    if (!hook) {
        console.warn('[admin-redeploy] VERCEL_DEPLOY_HOOK_URL no configurado — no se dispara redeploy');
        return res.status(200).json({ triggered: false, reason: 'hook_no_configurado' });
    }

    try {
        const r = await fetch(hook, { method: 'POST' });
        if (!r.ok) throw new Error(`Hook HTTP ${r.status}`);
        return res.status(200).json({ triggered: true });
    } catch (e) {
        console.error('[admin-redeploy] Error disparando hook:', e.message);
        return res.status(502).json({ triggered: false, error: e.message });
    }
}
```

- [ ] **Step 4: Run test + syntax check**

Run: `node tests/dni-guest.test.mjs && node --check api/admin-redeploy.js`
Expected: `✅ dni/guest checks passed` y sin errores de sintaxis.

- [ ] **Step 5: Commit**

```bash
git add api/admin-redeploy.js tests/dni-guest.test.mjs
git commit -m "feat(seo): endpoint admin-redeploy protegido (deploy hook)"
```

> **Config manual (post-deploy):** en Vercel → Project Settings → Git → **Deploy Hooks**, crear un hook (branch `main`) y guardar su URL como env `VERCEL_DEPLOY_HOOK_URL`. Sin esta env el endpoint responde `triggered: false` sin error.

---

### Task 9: El admin dispara redeploy al cambiar productos

**Files:**
- Modify: `js/admin-products.js` (helper nuevo + llamadas en `saveProduct` ~línea 537, `deleteProduct` ~línea 595, `toggleFeatured` ~línea 605)
- Test: `tests/dni-guest.test.mjs` (extender)

**Interfaces:**
- Consumes: `getAdminToken()`, `getAdminApiUrl(path)` (ya existen en `admin-products.js`); endpoint `/api/admin-redeploy` (Task 8).
- Produces: tras crear/editar/borrar/destacar un producto, se agenda (debounce 10s) un POST al endpoint de redeploy.

- [ ] **Step 1: Extend the failing test** — agregar en `tests/dni-guest.test.mjs`, antes del bloque `if (failed)`:

```javascript
// SEO1 — admin dispara redeploy en mutaciones
const adminProducts = read('js/admin-products.js');
inc('admin tiene triggerRedeploy', adminProducts, 'function triggerRedeploy');
inc('admin apunta al endpoint redeploy', adminProducts, '/api/admin-redeploy');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/dni-guest.test.mjs`
Expected: FAIL — `admin tiene triggerRedeploy: falta "function triggerRedeploy"`.

- [ ] **Step 3: Add the debounced helper** — en `js/admin-products.js`, después de `getAdminApiUrl` (~línea 27), agregar:

```javascript
let _redeployTimer = null;
function triggerRedeploy() {
    clearTimeout(_redeployTimer);
    _redeployTimer = setTimeout(async () => {
        try {
            const token = await getAdminToken();
            await fetch(getAdminApiUrl('/api/admin-redeploy'), {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
        } catch (e) {
            console.warn('[admin] No se pudo disparar redeploy:', e.message);
        }
    }, 10000);
}
```

- [ ] **Step 4: Call it after each product mutation** — agregar `triggerRedeploy();` inmediatamente después de `await loadProducts();` en las tres funciones:

En `saveProduct` (tras `await loadProducts();`, ~línea 537):
```javascript
        await loadProducts();
        triggerRedeploy();
```

En `deleteProduct` (~línea 595):
```javascript
        await loadProducts();
        triggerRedeploy();
```

En `toggleFeatured` (~línea 605):
```javascript
        await window.ProductsService.update(id, { featured: !isFeatured });
        await loadProducts();
        triggerRedeploy();
```

- [ ] **Step 5: Run test + syntax check**

Run: `node tests/dni-guest.test.mjs && node --check js/admin-products.js`
Expected: `✅ dni/guest checks passed` y sin errores de sintaxis.

- [ ] **Step 6: Commit**

```bash
git add js/admin-products.js tests/dni-guest.test.mjs
git commit -m "feat(seo): admin dispara redeploy al crear/editar/borrar producto"
```

---

## Verificación final (toda la suite)

- [ ] Correr todos los tests locales:

```bash
node tests/dni-guest.test.mjs && \
node tests/product-page.test.mjs && \
node tests/gen-product-pages.test.mjs && \
node tests/coupons.test.mjs && \
node tests/coupons-integration.test.mjs && \
node tests/stock.test.mjs && \
node tests/transfer-flow.test.js
```
Expected: todos imprimen su línea `✅ ... passed`.

- [ ] Generar páginas localmente (con `scripts/serviceAccountKey.json` presente) y revisar el output:

```bash
node scripts/gen-product-pages.mjs
```
Expected: `[gen] N páginas de producto generadas`, y aparece `producto/*.html` + `sitemap.xml` actualizado.

- [ ] **Verificación manual post-deploy** (preview primero, luego prod):
  1. Preview: `/producto/<slug>-<id>.html` existe, tiene JSON-LD (validar en Rich Results Test de Google) y el CTA "Comprar" abre el quick-view en el catálogo.
  2. Compra como **invitado** (sin login) de punta a punta.
  3. La orden en Firestore tiene `customer.dni`.
  4. Editar un producto en el admin → verificar en Vercel que se dispara un nuevo deploy (~10s después).

## Fuera de alcance (recordatorio del spec)

Galería visual multi-imagen, productos relacionados, página de producto como checkout completo, DNI en email admin / vista de orden, paginación, breadcrumbs/reviews en JSON-LD, regeneración incremental (v1 regenera todo el catálogo por build).
