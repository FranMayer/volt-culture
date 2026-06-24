# Diseño: Productos destacados — VOLT Culture

**Fecha:** 2026-06-24
**Estado:** Aprobado (brainstorming)

## Objetivo

Permitir que el admin marque y desmarque productos como **destacados**, y que la
sección de destacados de la home muestre esos productos en lugar de simplemente
los primeros del catálogo.

## Estado actual

- No existe un campo `featured`/destacado en el producto.
- `js/home-featured.js` muestra los **primeros 6** productos de
  `ProductsService.getAll()` (`products.slice(0, limit)`), sin concepto real de
  destacado. `limit` viene de `grid.dataset.limit` (default 6).
- El admin (`js/admin-products.js`) renderiza una tabla de productos con acciones
  por fila (Editar / Eliminar) vía funciones globales (`window.editProduct`,
  `window.deleteProduct`). `ProductsService.update(id, data)` ya escribe campos
  arbitrarios con `.update()` (merge).

## Decisiones (definidas en brainstorming)

1. **Control admin:** una **estrella por fila** (1 clic) en la columna de
   acciones. Lleno = destacado, contorno = no. Sirve de toggle y de indicador
   visual.
2. **Home sin destacados:** si no hay ningún producto destacado, **fallback** a
   los primeros productos (comportamiento actual), para que la home nunca quede
   vacía.
3. **Límite:** la home muestra **hasta 6** destacados (cap, como hoy).

## Modelo de datos

Campo nuevo en `products/{id}`:

| Campo      | Tipo    | Notas                                  |
|------------|---------|----------------------------------------|
| `featured` | boolean | Ausente/`false` = no destacado. `true` = destacado. |

- Se setea con `ProductsService.update(id, { featured })` (ya existe; usa
  `.update()`, que mergea sin pisar otros campos).
- No requiere colección nueva.
- **No requiere cambios en `firestore.rules`**: `products` ya tiene lectura
  pública y escritura solo admin.

## Componentes

### 1. Admin — estrella por fila (`js/admin-products.js`)

- **`renderProductCard(product)`**: agregar un botón estrella en el `<td>` de
  acciones, antes de Editar/Eliminar:
  - Estrella **rellena** (dorado clásico de favoritos `#FFD700`) si
    `p.featured === true`.
  - Estrella **contorno** (gris) si no.
  - `onclick="toggleFeatured('${p.id}', ${p.featured === true})"`.
  - `title`/`aria-label`: "Quitar de destacados" si está destacado, "Destacar"
    si no.
  - Icono estrella Lucide-style inline (variante fill vs stroke), siguiendo la
    convención de íconos del proyecto.
- **`async function toggleFeatured(id, isFeatured)`** (nueva):
  - `await window.ProductsService.update(id, { featured: !isFeatured });`
  - `await loadProducts();` para re-renderizar la tabla con el nuevo estado.
  - `try/catch` con `alert` en caso de error (mismo patrón que `deleteProduct`).
- **`init(deps)`**: exponer `window.toggleFeatured = toggleFeatured;` junto a
  `window.editProduct` / `window.deleteProduct`.

Sin tope duro al marcar: el admin puede destacar cualquier cantidad; la home
muestra hasta 6. No se agrega enforcement (YAGNI).

### 2. Home (`js/home-featured.js`)

Reemplazar:

```js
const featured = products.slice(0, limit);
```

por:

```js
const flagged = products.filter((p) => p.featured === true);
const featured = (flagged.length ? flagged : products).slice(0, limit);
```

- Si hay destacados → muestra esos, capeados a `limit` (6).
- Si no hay ninguno → fallback a los primeros `limit` (comportamiento actual).
- El resto del archivo (render, estados vacío/error, fallback de imágenes) no
  cambia.
- `getAll()` ya devuelve `featured` intacto (vía `_normalizeProduct`, que hace
  spread del producto), así que `p.featured` está disponible.

## Flujo de datos

```
Admin clickea la estrella en una fila
  -> toggleFeatured(id, isFeatured)
  -> ProductsService.update(id, { featured: !isFeatured })  (Firestore .update, merge)
  -> loadProducts() re-renderiza la tabla (estrella actualizada)

Home carga
  -> ProductsService.getAll()  (productos activos, con featured intacto)
  -> filtra featured === true
  -> si hay -> esos (cap 6); si no -> primeros 6
  -> renderiza la grilla
```

## Manejo de errores

- `toggleFeatured`: `try/catch` → `alert` con el error; al fallar, la tabla no
  cambia (no se llamó `loadProducts` o se vuelve a leer el estado real).
- Home: el filtro es puro; el fallback cubre el caso "sin destacados". Los
  estados de vacío/error existentes se mantienen.
- Editar un producto: el guardado usa un diff (`changed`) y nunca incluye
  `featured`, así que **editar no borra el flag**.

## Testing

Checks estáticos al estilo de `tests/home-commercial.test.js`:

- `js/home-featured.js` filtra por `featured` y mantiene el fallback
  (`filter((p) => p.featured === true)` y el `flagged.length ? ... : products`).
- `js/admin-products.js`: `renderProductCard` incluye `toggleFeatured(` y la
  estrella; `init` expone `window.toggleFeatured`.

## Fuera de alcance (YAGNI)

- Badge "Destacado" en el catálogo (la feature solo afecta la grilla de la home).
- Orden manual de destacados (el orden es el que devuelve `getAll()`).
- Checkbox de destacado en el modal de edición (se eligió solo la estrella por
  fila).
- Tope duro de 6 al marcar / contador de destacados en las stats del admin.
