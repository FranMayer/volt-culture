# Líneas de producción + subcategorías — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el sistema de categoría única por una taxonomía de dos niveles — línea de producción (TC / F1) + subcategoría (Remeras / Buzos / Pantalones / Gorras) — gestionable desde el admin con listas fijas.

**Architecture:** Cada producto gana un campo `line` (`"TC"` | `"F1"`) y reutiliza `category` como subcategoría. Los productos sin `line` se normalizan a `"TC"` (sin migración de datos). El admin elige línea + tipo con dos `<select>`. El catálogo muestra una barra lateral de dos bloques (líneas arriba, tipos debajo) y filtra por línea (cliente) + categoría (query Firestore).

**Tech Stack:** HTML + CSS + JS vanilla (sin framework ni build), Firebase compat 9.22 (Firestore), Bootstrap 5.3.3. Sin runner de tests: cada tarea se verifica manualmente en el navegador con un servidor estático (`npx serve .`).

## Global Constraints

- Sin build step: los archivos se sirven tal cual. No introducir dependencias ni bundlers.
- No romper productos existentes en Firestore: NO filtrar por `line` en la query de Firestore. Default `line='TC'` en `_normalizeProduct` y filtro de línea del lado cliente.
- Líneas fijas en código: `TC` (Turismo Carretera, disponible) y `F1` (Fórmula 1, `available:false` → "PRÓXIMAMENTE", bloqueada, sin productos).
- Subcategorías fijas y compartidas por ambas líneas: `Remeras`, `Buzos`, `Pantalones`, `Gorras`. Eliminar Polar, Tazas, Llaveros, Chops.
- Diseño VOLT: esquinas rectas (`border-radius: 0`), paleta `#000`/`#fff`/`#c1121f`. Reusar el patrón visual del badge "PRÓXIMAMENTE" existente (`.category-soon-badge`, `.category-sidebar-soon`).
- Commits frecuentes, uno por tarea.

---

### Task 1: Modelo de datos en `products-service.js`

Default `line='TC'` al normalizar y soporte de filtrado por línea en `getAll`.

**Files:**
- Modify: `js/products-service.js` — `getAll` (línea ~168), `_getFromFirestore` (~233), `_getFromSample` (~255), `_normalizeProduct` (return en ~334).

**Interfaces:**
- Produces:
  - `ProductsService.getAll(category = null, line = null)` → `Promise<Product[]>`. Filtra `category` en la query de Firestore (como hoy) y `line` del lado cliente. `line` puede ser `'TC'`, `'F1'` o `null`/`'all'` (sin filtro de línea).
  - `_normalizeProduct(product)` ahora garantiza `product.line` (`'TC'` si falta o vacío; en otro caso el valor tal cual, en mayúsculas).

- [ ] **Step 1: Normalizar `line` por defecto a `'TC'`**

En `_normalizeProduct`, justo antes de `return normalized;` (actualmente línea ~334), agregar:

```js
        // Línea de producción: los productos viejos no tienen `line`.
        // Se asume Turismo Carretera (TC) por defecto, sin migrar datos.
        normalized.line = String(normalized.line || 'TC').trim().toUpperCase() || 'TC';

        return normalized;
```

- [ ] **Step 2: Extender la firma de `getAll` con `line`**

Reemplazar el método `getAll` actual (líneas ~168-176):

```js
    async getAll(category = null, line = null) {
        // Si Firebase está configurado, usar Firestore
        if (window.FirebaseConfig && window.FirebaseConfig.isInitialized()) {
            return await this._getFromFirestore(category, line);
        }

        // Si no, usar datos de ejemplo
        return this._getFromSample(category, line);
    },
```

- [ ] **Step 3: Filtrar por línea (cliente) en `_getFromFirestore`**

Reemplazar la firma y el armado del array en `_getFromFirestore` (líneas ~233-250). La query de Firestore NO cambia (sigue filtrando solo `active` y `category`); el filtro de línea se aplica tras normalizar:

```js
    async _getFromFirestore(category, line) {
        const db = window.FirebaseConfig.getDb();
        let query = db.collection('products').where('active', '==', true);

        if (category && category !== 'all') {
            query = query.where('category', '==', category);
        }

        const snapshot = await query.get();
        let products = [];

        snapshot.forEach(doc => {
            const data = this._normalizeProduct({ id: doc.id, ...doc.data() });
            products.push(data);
        });

        if (line && line !== 'all') {
            const wanted = String(line).toUpperCase();
            products = products.filter(p => p.line === wanted);
        }

        return products;
    },
```

- [ ] **Step 4: Filtrar por línea (cliente) en `_getFromSample`**

Reemplazar `_getFromSample` (líneas ~255-263):

```js
    _getFromSample(category, line) {
        let products = SAMPLE_PRODUCTS.filter(p => p.active).map(p => this._normalizeProduct(p));

        if (category && category !== 'all') {
            products = products.filter(p => p.category === category);
        }

        if (line && line !== 'all') {
            const wanted = String(line).toUpperCase();
            products = products.filter(p => p.line === wanted);
        }

        return Promise.resolve(products);
    },
```

- [ ] **Step 5: Verificar en navegador (consola)**

Levantar el sitio (`npx serve .`) y abrir `pages/catalogo.html`. En la consola del navegador:

```js
// Todos los productos viejos deben tener line === 'TC'
(await window.ProductsService.getAll()).every(p => p.line === 'TC')   // → true
// Filtro por línea TC devuelve productos; F1 devuelve []
(await window.ProductsService.getAll(null, 'TC')).length               // → > 0
(await window.ProductsService.getAll(null, 'F1')).length               // → 0
// El filtro por categoría sigue funcionando
(await window.ProductsService.getAll('Remeras', 'TC')).every(p => p.category === 'Remeras') // → true
```

Esperado: los 3 comentarios se cumplen. Sin errores en consola.

- [ ] **Step 6: Commit**

```bash
git add js/products-service.js
git commit -m "feat(catalog): add production line field with TC default in products service"
```

---

### Task 2: Admin — selector de línea y subcategorías reducidas

**Files:**
- Modify: `admin/panel.html` — bloque de Categoría (líneas ~1089-1101).
- Modify: `js/admin-products.js` — `renderProductCard` (~57-88), `saveProduct` productData (~448-462), `editProduct` (~511-531).

**Interfaces:**
- Consumes: `ProductsService.getAll` / `_normalizeProduct` con `line` (Task 1).
- Produces: productos guardados con campo `line` (`'TC'`|`'F1'`). El admin lee `#productLine` y `#productCategory`.

- [ ] **Step 1: Reemplazar el bloque de Categoría por Línea + Tipo en `admin/panel.html`**

Reemplazar el `<div class="col-md-6 mb-3">` que contiene `#productCategory` (líneas ~1089-1101) por dos columnas. Como ahora hay 3 campos en la fila (Nombre, Línea, Tipo), pasar a `col-md-4`. Reemplazar también el `col-md-6` del Nombre por `col-md-4`:

```html
                            <div class="col-md-4 mb-3">
                                <label class="form-label">Nombre *</label>
                                <input type="text" class="form-control" id="productName" required>
                            </div>
                            <div class="col-md-4 mb-3">
                                <label class="form-label">Línea de producción *</label>
                                <select class="form-select" id="productLine" required>
                                    <option value="TC">Turismo Carretera (TC)</option>
                                    <option value="F1">Fórmula 1 (F1)</option>
                                </select>
                            </div>
                            <div class="col-md-4 mb-3">
                                <label class="form-label">Tipo / Subcategoría *</label>
                                <select class="form-select" id="productCategory" required>
                                    <option value="">Seleccionar...</option>
                                    <option value="Remeras">Remeras</option>
                                    <option value="Buzos">Buzos</option>
                                    <option value="Pantalones">Pantalones</option>
                                    <option value="Gorras">Gorras</option>
                                </select>
                            </div>
```

(El `<input id="productName">` queda igual salvo `col-md-6` → `col-md-4`.)

- [ ] **Step 2: Persistir `line` al guardar en `js/admin-products.js`**

En `saveProduct`, dentro del objeto `productData` (línea ~448), agregar `line` justo después de `category`:

```js
        category: document.getElementById('productCategory').value,
        line: (document.getElementById('productLine').value || 'TC').toUpperCase(),
```

- [ ] **Step 3: Incluir `line` en `editOriginal` (diff de cambios)**

En `editProduct`, dentro de `adminFormState.editOriginal` (línea ~520), agregar tras `category`:

```js
                category: product.category || '',
                line: (product.line || 'TC').toUpperCase(),
```

- [ ] **Step 4: Cargar `line` al editar**

En `editProduct`, junto a `document.getElementById('productCategory').value = product.category;` (línea ~512), agregar:

```js
            document.getElementById('productCategory').value = product.category;
            document.getElementById('productLine').value = (product.line || 'TC').toUpperCase();
```

- [ ] **Step 5: Mostrar la línea en la tabla del admin**

En `renderProductCard` (línea ~66), reemplazar la celda de categoría para mostrar línea + tipo:

```js
            <td>${p.line || 'TC'} · ${p.category}</td>
```

- [ ] **Step 6: Verificar en navegador**

Levantar el sitio y abrir `admin/panel.html` (logueado como admin). Verificar:
- El modal "Agregar producto" muestra los selects "Línea de producción" (default TC) y "Tipo / Subcategoría" con solo Remeras/Buzos/Pantalones/Gorras.
- Crear un producto de prueba con línea TC → aparece en la tabla como `TC · <tipo>`.
- Editar un producto existente → el select de Línea muestra `TC` (default), el de Tipo muestra su categoría.
- Cambiar la línea a F1, guardar, reabrir → persiste `F1`. (Borrar el producto de prueba al terminar.)

Esperado: todo lo anterior se cumple, sin errores en consola.

- [ ] **Step 7: Commit**

```bash
git add admin/panel.html js/admin-products.js
git commit -m "feat(admin): production line select and reduced subcategory list"
```

---

### Task 3: Catálogo — barra lateral de dos niveles y filtrado

**Files:**
- Modify: `pages/catalogo.html` — sidebar `.category-list` (líneas ~167-174).
- Modify: `js/catalog.js` — constantes/`ALL_CATEGORIES` (~474), `loadCategories` (~476-484), `loadProducts` (~38-44), `initCategoryFilters` (~508-525), `applyCategoryFromQuery` (~490-506).

**Interfaces:**
- Consumes: `ProductsService.getAll(category, line)` (Task 1).
- Produces: estado de UI con línea activa (default `'TC'`) y subcategoría activa (default `'all'`); soporte de query string `?line=` y `?cat=`.

- [ ] **Step 1: Reescribir el contenedor del sidebar en `pages/catalogo.html`**

Reemplazar el bloque `<div class="category-list">…</div>` (líneas ~167-174) por dos listas (líneas + tipos):

```html
        <!-- Sidebar: líneas de producción + tipos -->
        <div class="category-list">
            <h3>Líneas</h3>
            <ul class="line-list">
                <!-- Las líneas se cargan dinámicamente -->
            </ul>
            <h3 class="category-list__types-title">Tipo</h3>
            <ul class="type-list">
                <!-- Las subcategorías se cargan dinámicamente -->
                <li class="active" data-category="all">Ver todos</li>
            </ul>
        </div>
```

- [ ] **Step 2: Reemplazar constantes y estado en `js/catalog.js`**

Reemplazar la línea `const ALL_CATEGORIES = ['Remeras', 'Buzos', 'Gorras'];` (~474) por las constantes de líneas/tipos y el estado de filtro. Colocar también las referencias a las dos `<ul>`:

```js
    const PRODUCTION_LINES = [
        { id: 'TC', label: 'Turismo Carretera (TC)', available: true },
        { id: 'F1', label: 'Fórmula 1', available: false }
    ];
    const ALL_CATEGORIES = ['Remeras', 'Buzos', 'Pantalones', 'Gorras'];

    // Estado del filtro de dos niveles
    const filterState = { line: 'TC', category: 'all' };
```

- [ ] **Step 3: Reescribir `loadProducts` para pasar línea + categoría**

Reemplazar la firma/llamada de `loadProducts` (líneas ~38-44). En vez de recibir solo `category`, lee del `filterState`:

```js
    async function loadProducts() {
        try {
            // Mostrar loader
            if (loader) loader.style.display = 'flex';

            const category = filterState.category === 'all' ? null : filterState.category;
            const line = filterState.line === 'all' ? null : filterState.line;
            const products = await window.ProductsService.getAll(category, line);
```

(El resto del cuerpo de `loadProducts` queda igual.)

- [ ] **Step 4: Reescribir `loadCategories` para renderizar líneas + tipos**

Reemplazar `loadCategories` (líneas ~476-484):

```js
    function loadCategories() {
        const lineList = document.querySelector('.category-list .line-list');
        const typeList = document.querySelector('.category-list .type-list');
        if (!lineList || !typeList) return;

        lineList.innerHTML = PRODUCTION_LINES.map(l => {
            if (!l.available) {
                return `<li class="category-sidebar-soon" aria-disabled="true">${l.label} <span class="category-soon-badge">PRÓXIMAMENTE</span></li>`;
            }
            const active = l.id === filterState.line ? ' active' : '';
            return `<li class="line-item${active}" data-line="${l.id}">${l.label}</li>`;
        }).join('');

        typeList.innerHTML = `
            <li class="active" data-category="all">Ver todos</li>
            ${ALL_CATEGORIES.map(cat => `<li data-category="${cat}">${cat}</li>`).join('')}
        `;
        initCategoryFilters();
    }
```

- [ ] **Step 5: Reescribir `initCategoryFilters` para manejar ambos niveles**

Reemplazar `initCategoryFilters` (líneas ~508-525):

```js
    function initCategoryFilters() {
        const lineItems = document.querySelectorAll('.category-list .line-item');
        const typeItems = document.querySelectorAll('.category-list .type-list li[data-category]');

        lineItems.forEach(item => {
            item.addEventListener('click', async function () {
                lineItems.forEach(i => i.classList.remove('active'));
                this.classList.add('active');
                filterState.line = this.getAttribute('data-line');
                await loadProducts();
            });
        });

        typeItems.forEach(item => {
            item.addEventListener('click', async function () {
                typeItems.forEach(i => i.classList.remove('active'));
                this.classList.add('active');
                filterState.category = this.getAttribute('data-category');
                await loadProducts();
            });
        });
    }
```

- [ ] **Step 6: Soportar `?line=` y `?cat=` en `applyCategoryFromQuery`**

Reemplazar `applyCategoryFromQuery` (líneas ~490-506) para aplicar primero la línea y luego el tipo desde el query string:

```js
    function applyCategoryFromQuery() {
        const params = new URLSearchParams(window.location.search);
        const lineParam = (params.get('line') || '').toLowerCase().trim();
        const catParam = (params.get('cat') || '').toLowerCase().replace(/\+/g, ' ').trim();

        if (lineParam) {
            const lineLis = document.querySelectorAll('.category-list .line-item');
            lineLis.forEach(li => {
                if ((li.getAttribute('data-line') || '').toLowerCase() === lineParam) li.click();
            });
        }

        if (catParam) {
            const typeLis = document.querySelectorAll('.category-list .type-list li[data-category]');
            typeLis.forEach(li => {
                const v = (li.getAttribute('data-category') || '').toLowerCase();
                if (v === catParam || v.replace(/\s+/g, '-') === catParam.replace(/\s+/g, '-')) li.click();
            });
        }
    }
```

- [ ] **Step 7: Verificar en navegador**

Levantar el sitio y abrir `pages/catalogo.html`. Verificar:
- El sidebar muestra el bloque "Líneas" con "Turismo Carretera (TC)" activa y "Fórmula 1 — PRÓXIMAMENTE" bloqueada (no clickeable).
- Debajo, bloque "Tipo": Ver todos / Remeras / Buzos / Pantalones / Gorras.
- Por defecto se ven los productos TC. Clic en "Remeras" filtra a remeras TC; "Ver todos" vuelve a todas las TC.
- Clic en "Fórmula 1" no hace nada (bloqueada).
- Abrir `pages/catalogo.html?cat=buzos` → arranca con Buzos seleccionado. `?line=tc` no rompe nada.

Esperado: todo lo anterior se cumple, sin errores en consola.

- [ ] **Step 8: Commit**

```bash
git add pages/catalogo.html js/catalog.js
git commit -m "feat(catalog): two-level sidebar (production line + subcategory)"
```

---

### Task 4: Estilos del bloque de líneas

**Files:**
- Modify: `css/style.css` — cerca de las reglas existentes `.category-list`, `.category-soon-badge` (~791), `.category-sidebar-soon` (~1260).

**Interfaces:**
- Consumes: markup de Task 3 (`.line-list`, `.line-item`, `.type-list`, `.category-list__types-title`).

- [ ] **Step 1: Agregar estilos para el bloque de líneas**

Agregar junto a las reglas de `.category-list` en `css/style.css` (después de `.category-list li.category-sidebar-soon::before { display:none; }`, ~1268):

```css
/* Bloque de líneas de producción (nivel 1 del sidebar) */
.category-list .line-list {
    list-style: none;
    padding: 0;
    margin: 0 0 1.5rem 0;
}
.category-list .line-item {
    cursor: pointer;
    font-weight: 700;
}
.category-list .line-item.active {
    color: #c1121f;
}
.category-list__types-title {
    margin-top: 1rem;
}
```

(Reglas de tipografía/espaciado de `<li>` ya vienen heredadas de `.category-list li`. No tocar `.category-soon-badge` ni `.category-sidebar-soon`: se reutilizan tal cual para F1.)

- [ ] **Step 2: Verificar en navegador**

Recargar `pages/catalogo.html`. Verificar:
- Las líneas se ven como un bloque propio arriba, con la activa resaltada en rojo `#c1121f` y esquinas rectas.
- F1 con opacidad reducida y badge "PRÓXIMAMENTE".
- El bloque "Tipo" queda claramente separado debajo.
- Responsive: en mobile/tablet el sidebar no se rompe (revisar a ~375px y ~768px).

Esperado: layout correcto y coherente con el diseño VOLT.

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "style(catalog): production line sidebar block"
```

---

## Notas de cierre

- **Tipos eliminados:** un producto viejo con categoría Polar/Tazas/Llaveros/Chops seguirá apareciendo en "Ver todos" (su línea normaliza a TC) pero sin filtro de tipo propio. Reasignarlo desde el admin si aparece.
- **F1:** queda lista a nivel datos y UI (bloqueada). Cuando haya productos F1, basta cambiar `available:false` → `true` en `PRODUCTION_LINES` (catalog.js) — fuera del alcance de este plan.
- **Resto del sitio (sin cambios necesarios):** `js/home-featured.js` llama `getAll()` sin argumentos → `getAll(null, null)`, compatible con la firma nueva. `js/filtrocat.js` NO se carga en `pages/catalogo.html`, así que no interfiere. Tras Task 3, verificar igual que el carrusel de destacados del home siga cargando productos.
