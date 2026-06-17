# Líneas de producción + subcategorías — Diseño

**Fecha:** 2026-06-16
**Estado:** Aprobado (pendiente revisión del spec por el usuario)

## Contexto

Hoy cada producto tiene un único campo `category` (texto libre, elegido de un
`<select>` fijo en el admin). El catálogo arma su barra lateral con una lista
hardcodeada en JS (`ALL_CATEGORIES = ['Remeras', 'Buzos', 'Gorras']`) y filtra
por `where('category', '==', X)` en Firestore.

Se quiere pasar a una taxonomía de **dos niveles**:

- **Nivel 1 — Línea de producción:** Turismo Carretera (TC) y Fórmula 1 (F1).
- **Nivel 2 — Subcategoría / tipo:** Remeras, Buzos, Pantalones, Gorras.

Todos los productos actuales pertenecen a TC. F1 aún no tiene productos y se
muestra "PRÓXIMAMENTE". La gestión es por **listas fijas** definidas en código
(no taxonomía editable por CRUD).

## Decisiones tomadas

- **Alcance admin:** listas fijas en código; cada producto se asigna a una
  línea + subcategoría con dos `<select>`. Agregar/quitar opciones implica editar
  el código.
- **Navegación del catálogo:** línea arriba, subcategorías debajo (una columna en
  la barra lateral).
- **Subcategorías definitivas:** Remeras, Buzos, Pantalones, Gorras.
- **Se eliminan** del admin: Polar, Tazas, Llaveros, Chops.
- **Subcategorías compartidas** por ambas líneas (TC y F1 usan la misma lista).

## 1. Modelo de datos

Cada producto pasa a tener dos campos relevantes:

- `line` → línea de producción: `"TC"` o `"F1"`.
- `category` → subcategoría / tipo (Remeras / Buzos / Pantalones / Gorras).
  Se mantiene el nombre del campo `category` para minimizar la migración.

**Migración sin tocar datos:** en la normalización de productos
(`products-service.js` → `_normalizeProduct`), si un producto no trae `line`, se
asume `"TC"` por defecto. Así todos los productos actuales caen bajo Turismo
Carretera automáticamente, sin script de migración ni edición manual. Los
productos nuevos eligen línea en el admin (default TC).

Constantes compartidas (mismas en admin y catálogo):

```js
const PRODUCTION_LINES = [
  { id: 'TC', label: 'Turismo Carretera (TC)', available: true },
  { id: 'F1', label: 'Fórmula 1',              available: false }, // PRÓXIMAMENTE
];
const SUBCATEGORIES = ['Remeras', 'Buzos', 'Pantalones', 'Gorras'];
```

## 2. Admin (`admin/panel.html` + `js/admin-products.js`)

- Nuevo `<select id="productLine">` "Línea de producción": Turismo Carretera (TC) /
  Fórmula 1 (F1). Default: TC. Requerido.
- El `<select id="productCategory">` "Tipo / Subcategoría" se reduce a:
  Remeras, Buzos, Pantalones, Gorras (se quitan Polar, Tazas, Llaveros, Chops).
- `saveProduct`: persistir `line` además de `category`; incluir `line` en
  `editOriginal` y en el diff de cambios.
- `editProduct`: cargar `product.line` (default `'TC'`) en el `<select>`.
- Tabla de productos del admin: mostrar la línea junto al tipo (columna o badge).

## 3. Catálogo (`pages/catalogo.html` + `js/catalog.js`)

Barra lateral en dos bloques:

```
LÍNEAS
  ● Turismo Carretera (TC)
  ○ Fórmula 1   [PRÓXIMAMENTE]   ← bloqueada, sin productos

TIPO
  • Ver todos
  • Remeras
  • Buzos
  • Pantalones
  • Gorras
```

- Estado de filtro: línea activa (default `'TC'`) + subcategoría activa
  (default `'all'`).
- Elegir línea → filtra por `line`; elegir tipo → filtra por `category` dentro de
  la línea activa.
- **F1 bloqueada** con badge "PRÓXIMAMENTE" (mismo patrón que el actual
  "Autos a escala", que se reemplaza por esta estructura).
- Filtrado: `ProductsService.getAll` debe poder filtrar por línea y/o categoría.
  Como los productos viejos no tienen `line` en Firestore, NO se filtra por
  `line` en la query de Firestore (rompería con los viejos). En su lugar:
  `_normalizeProduct` setea `line='TC'` por defecto y el filtro por línea se
  aplica del lado cliente tras normalizar. El volumen de productos es chico, así
  que el costo es despreciable. El filtro por `category` puede seguir en la query
  de Firestore como hoy.
- Query string: se mantiene `?cat=` y se agrega `?line=`.

## 4. Alcance

**Incluye:**
- Modelo de datos (`line` + `category` como subcategoría, default TC).
- Admin: selector de línea, lista de subcategorías reducida, persistencia y tabla.
- Catálogo: barra lateral de dos niveles, filtrado por línea + tipo, F1 bloqueada.
- Verificar que el resto del sitio (home destacados, links de nav a categorías)
  no se rompa con el nuevo modelo.

**No incluye:**
- Taxonomía editable por CRUD (descartado explícitamente).
- Construir productos / página de la línea F1 (solo dejarla lista y bloqueada).

**Nota sobre tipos eliminados:** un producto viejo con categoría Polar/Tazas/
Llaveros/Chops seguirá apareciendo en "Ver todos" pero sin filtro propio en la
barra lateral. Se recomienda reasignarlo desde el admin.

## Archivos afectados

- `admin/panel.html` — nuevo select de línea; opciones de categoría reducidas.
- `js/admin-products.js` — leer/guardar `line`; editOriginal/diff; tabla.
- `pages/catalogo.html` — estructura de la barra lateral (dos bloques).
- `js/catalog.js` — constantes, render de líneas + tipos, lógica de filtrado,
  query string `?line=`.
- `js/products-service.js` — `_normalizeProduct` default `line='TC'`; filtrado
  por línea en `getAll` / `_getFromFirestore` / `_getFromSample`.
- CSS (`css/style.css` o `css/volt-ds.css`) — estilos del bloque de líneas y del
  ítem bloqueado (reusar lo del badge "PRÓXIMAMENTE" actual).
