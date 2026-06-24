# Productos destacados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el admin marque/desmarque productos como destacados con una estrella por fila, y que la grilla de destacados de la home muestre esos productos (con fallback a los primeros si no hay ninguno).

**Architecture:** Un campo booleano `featured` en el doc de producto, seteado con el `ProductsService.update(id, data)` existente (merge). El admin agrega un botón estrella por fila que togglea el flag y recarga la tabla. La home filtra por `featured` y cae a los primeros productos si no hay destacados. Sin colección nueva ni cambios de reglas (products ya es lectura pública / escritura admin).

**Tech Stack:** Vanilla JS (sin bundler), Firebase compat 9.22 (cliente), Bootstrap 5.3.3. Tests estáticos en Node (`node tests/<archivo>.js`), estilo `tests/home-commercial.test.js`.

## Global Constraints

- Sin build step. Frontend vanilla; el admin y la home usan Firebase compat global.
- Campo nuevo: `featured: boolean` en `products/{id}`. Ausente/`false` = no destacado.
- Estrella **rellena en dorado clásico `#FFD700`** si destacado; **contorno gris** si no. Icono estrella Lucide-style inline (convención del proyecto: SVG inline, no CLI).
- Toggle admin: un clic por fila → `ProductsService.update(id, { featured })` → `loadProducts()`.
- Home: si hay destacados muestra esos (cap al `limit` actual del grid); si NO hay ninguno, fallback a los primeros `limit`. El `limit` viene de `grid.dataset.limit` (hoy `data-limit="3"` en `index.html`) — **no se cambia**; mantiene la grilla actual.
- Sin cambios en `firestore.rules`. Sin colección nueva.
- Editar un producto NO debe borrar `featured` (el guardado usa diff y no incluye el campo — ya es así, no tocar).
- Tests: checks estáticos al estilo `tests/home-commercial.test.js` (leer archivo + assert substrings), corridos con `node tests/<archivo>.js`, exit ≠ 0 si fallan.

---

### Task 1: Home — filtrar destacados con fallback

**Files:**
- Modify: `js/home-featured.js` (la línea `const featured = products.slice(0, limit);`)
- Create: `tests/featured-products.test.js`

**Interfaces:**
- Consumes: `ProductsService.getAll()` (ya devuelve `featured` intacto vía `_normalizeProduct`), `grid.dataset.limit`.
- Produces: archivo de test `tests/featured-products.test.js` con helpers `read(rel)` e `inc(label, hay, needle)` que la Task 2 amplía.

- [ ] **Step 1: Write the failing test**

Create `tests/featured-products.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/featured-products.test.js`
Expected: FAIL — `home filtra por featured: missing "p.featured === true"`.

- [ ] **Step 3: Implement the filter + fallback**

In `js/home-featured.js`, replace this line (currently line 50):

```js
            const featured = products.slice(0, limit);
```

with:

```js
            const flagged = products.filter((p) => p.featured === true);
            const featured = (flagged.length ? flagged : products).slice(0, limit);
```

(Everything else — `limit` computation, empty/error states, rendering — stays unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/featured-products.test.js`
Expected: `✅ featured products checks passed`

- [ ] **Step 5: Run the existing home test (regression)**

Run: `node tests/home-commercial.test.js`
Expected: `home commercial checks passed` (this task doesn't touch `index.html`, so it must still pass).

- [ ] **Step 6: Commit**

```bash
git add js/home-featured.js tests/featured-products.test.js
git commit -m "feat(featured): home shows featured products with fallback to first products"
```

---

### Task 2: Admin — estrella por fila para destacar/quitar

**Files:**
- Modify: `js/admin-products.js` (`renderProductCard`, nueva `toggleFeatured`, `init`)
- Test: `tests/featured-products.test.js` (append)

**Interfaces:**
- Consumes: `window.ProductsService.update(id, data)` (merge), `loadProducts()` (función de módulo existente), patrón `window.editProduct`/`window.deleteProduct`.
- Produces: `window.toggleFeatured(id, isFeatured)` global; estrella en la columna de acciones.

- [ ] **Step 1: Write the failing test**

Append to `tests/featured-products.test.js`, **before** the `if (failed > 0)` block:

```js
// ── Admin: estrella + toggleFeatured + expuesto en window ──
const adminProducts = read('js/admin-products.js');
inc('admin estrella llama toggleFeatured', adminProducts, 'toggleFeatured(');
inc('admin estrella usa dorado #FFD700', adminProducts, '#FFD700');
inc('admin define toggleFeatured', adminProducts, 'async function toggleFeatured');
inc('admin togglea el flag', adminProducts, 'featured: !isFeatured');
inc('admin expone window.toggleFeatured', adminProducts, 'window.toggleFeatured = toggleFeatured');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/featured-products.test.js`
Expected: FAIL — `admin estrella llama toggleFeatured: missing "toggleFeatured("`.

- [ ] **Step 3: Add the star button to the row actions**

In `js/admin-products.js`, in `renderProductCard`, replace the actions cell (currently lines 78–85):

```js
            <td>
                <button class="btn btn-sm btn-outline-volt" onclick="editProduct('${p.id}')" title="Editar" aria-label="Editar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-0.15em"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteProduct('${p.id}')" title="Eliminar" aria-label="Eliminar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-0.15em"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                </button>
            </td>
```

with (star button added first):

```js
            <td>
                <button class="btn btn-sm btn-outline-secondary" onclick="toggleFeatured('${p.id}', ${p.featured === true})" title="${p.featured === true ? 'Quitar de destacados' : 'Destacar'}" aria-label="${p.featured === true ? 'Quitar de destacados' : 'Destacar'}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="${p.featured === true ? '#FFD700' : 'none'}" stroke="${p.featured === true ? '#FFD700' : 'currentColor'}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-0.15em"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </button>
                <button class="btn btn-sm btn-outline-volt" onclick="editProduct('${p.id}')" title="Editar" aria-label="Editar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-0.15em"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteProduct('${p.id}')" title="Eliminar" aria-label="Eliminar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-0.15em"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                </button>
            </td>
```

- [ ] **Step 4: Add the `toggleFeatured` function**

In `js/admin-products.js`, immediately after the `deleteProduct` function (it ends around line 600, just before the next function/`init`), add:

```js
async function toggleFeatured(id, isFeatured) {
    try {
        await window.ProductsService.update(id, { featured: !isFeatured });
        await loadProducts();
    } catch (error) {
        console.error('Error al cambiar destacado:', error);
        alert(`❌ No se pudo actualizar el destacado: ${error.message}`);
    }
}
```

- [ ] **Step 5: Expose `toggleFeatured` globally**

In `js/admin-products.js`, in `init`, replace (currently lines 672–673):

```js
    window.editProduct = editProduct;
    window.deleteProduct = deleteProduct;
```

with:

```js
    window.editProduct = editProduct;
    window.deleteProduct = deleteProduct;
    window.toggleFeatured = toggleFeatured;
```

- [ ] **Step 6: Run tests + syntax check**

Run: `node tests/featured-products.test.js`
Expected: `✅ featured products checks passed`

Run: `node --check js/admin-products.js`
Expected: clean (no output).

- [ ] **Step 7: Commit**

```bash
git add js/admin-products.js tests/featured-products.test.js
git commit -m "feat(featured): admin star button to toggle product featured state"
```

- [ ] **Step 8: Manual QA (browser, after deploy or via local server)**

No automatable browser test exists. Verify manually:
1. Panel admin → tab Productos → cada fila tiene una estrella (contorno) además de Editar/Eliminar.
2. Clic en la estrella de un producto → se rellena en dorado y la tabla recarga; el producto queda con `featured: true` en Firestore.
3. Home → la grilla de destacados muestra ese producto.
4. Clic de nuevo en la estrella → vuelve a contorno; si no queda ningún destacado, la home vuelve a mostrar los primeros productos.
5. Editar un producto destacado y guardar → sigue destacado (el flag no se borra).

---

## Notas

- **Cantidad mostrada en la home:** la grilla usa `data-limit="3"` en `index.html`, así que muestra hasta 3 destacados (mantiene el diseño actual). Si querés mostrar hasta 6, es cambiar ese único atributo `data-limit="3"` → `data-limit="6"` (y actualizar la aserción `data-limit="3"` en `tests/home-commercial.test.js`). No está incluido en este plan para no alterar la grilla.
- Sin cambios en `firestore.rules` ni en `products-service.js` (el `update` genérico ya sirve).
