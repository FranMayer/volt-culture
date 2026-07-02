# Diseño: Páginas de producto (SEO) + Checkout invitado + DNI — VOLT Culture

**Fecha:** 2026-07-02
**Estado:** Aprobado (brainstorming)

## Objetivo

Tres cambios de storefront, independientes entre sí pero aprobados juntos:

1. **SEO1** — Generar una página HTML estática por producto (`/producto/*.html`) con
   structured data `Product`, para que Google indexe el catálogo (hoy es 100%
   render en el cliente y es invisible para crawlers).
2. **N2** — Permitir comprar **sin cuenta** (checkout invitado), manteniendo la
   recolección de datos necesarios para el envío.
3. **N6** — Persistir el **DNI** en la orden (lo exige Andreani; hoy se pide,
   valida y muestra, pero no se guarda).

## Estado actual

- El catálogo (`pages/catalogo.html` + `js/catalog.js`) renderiza productos desde
  Firestore vía JS. No hay URL por producto. `sitemap.xml` lista solo 5 páginas
  estáticas. El sitio no tiene build step (se sirve tal cual desde la raíz).
- El checkout (`js/pagos.js`) exige login antes de pagar en ambos flujos
  (`window.VoltStoreAuth.requireAuth()` en el handler de `checkout-btn` y en el de
  `transfer-btn`).
- El form de checkout ya recolecta y valida DNI (7-8 dígitos, `validateDni`), lo
  guarda en localStorage y lo incluye en el texto de WhatsApp — pero
  `create-preference.js` y `create-transfer-order.js` arman
  `customer: { name, phone, email }` y **descartan** el `dni`.
- Los productos en Firestore traen imágenes en: `image`/`imageUrl` (principal,
  string), `images[]` (galería; strings u objetos `{url|src}`), y
  `variantImages`/`imagesByColor` (mapas color → url).
- Ya existen scripts Node con `firebase-admin` en `scripts/` (patrón conocido) y
  las env `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` en
  Vercel (disponibles también en build time).

## Decisiones (definidas en brainstorming)

1. **Generación:** build step en Vercel. Un script Node lee Firestore en cada
   deploy y emite `/producto/{slug}-{id}.html` + regenera `sitemap.xml`.
2. **Página de producto:** landing de SEO (no página de compra completa). Contenido
   horneado + JSON-LD, y CTA "Comprar" que deep-linkea al quick-view del catálogo.
   Reusa toda la lógica de carrito/variantes existente.
3. **Hidratación en vivo:** la página carga Firebase (compat, ya en CDN), hace
   `get` del producto por id y actualiza el precio y la disponibilidad visibles.
4. **Frescura:** Deploy Hook automático en v1. El admin dispara un redeploy al
   crear/editar/borrar/(des)activar un producto, vía endpoint serverless protegido
   (la URL del hook NO se expone al cliente).
5. **JSON-LD `image`:** array con todas las imágenes disponibles del producto
   (principal + galería + imágenes por variante), aunque el template visual muestre
   solo la principal. Google soporta múltiples imágenes; agregarlas después sería
   doloroso.
6. **Template mínimo indexable:** sin galería multi-imagen visual ni productos
   relacionados en v1 (son mejoras de conversión, no de indexación).
7. **Checkout invitado:** sin login, pero con todos los datos de envío.
8. **DNI:** requerido y persistido en la orden en ambos flujos.

## SEO1 — Páginas de producto

### Modelo de URL

`/producto/{slug}-{id}.html` donde `slug = slugify(name)` (minúsculas, sin
acentos, espacios → guiones, sin caracteres no `[a-z0-9-]`) e `{id}` es el id de
Firestore. El sufijo `-{id}` garantiza unicidad ante nombres repetidos; la parte
`slug` aporta keywords a la URL.

Ej: producto "Hoodie F1 Negro" id `a1b2c3` → `/producto/hoodie-f1-negro-a1b2c3.html`.

### Script `scripts/gen-product-pages.mjs`

- **Init:** `firebase-admin` desde env `FIREBASE_*` (mismo parsing que las API:
  `replace(/\\n/g,'\n')` en la private key). En local, si no hay env, cae a
  `scripts/serviceAccountKey.json`.
- **Lectura:** `products` con `active == true`.
- **Por producto:**
  - Construye el array de imágenes para JSON-LD: dedupe de `[image|imageUrl,
    ...images (url si es objeto), ...values(variantImages), ...values(imagesByColor)]`,
    normalizando a URL absoluta (`https://voltculture.com.ar/...` para paths
    relativos). La imagen principal (primera) alimenta también el `<img>` visible
    y el `og:image`.
  - Renderiza el HTML desde una función template (ver abajo).
  - Escribe `producto/{slug}-{id}.html`.
- **Sitemap:** regenera `sitemap.xml` con las 5 URLs estáticas actuales + una `<url>`
  por producto (`changefreq: weekly`, `priority: 0.8`).
- **Salida a stdout:** cantidad de páginas generadas (para ver en logs de build).

El script es el único lugar con lógica de template; se puede correr local
(`node scripts/gen-product-pages.mjs`) para inspeccionar el output sin deployar.

### Template de página (función pura, testeable)

Una función `renderProductPage(product, { siteUrl })` → string HTML. Standalone,
reusa `/css/volt-ds.css`, nav y footer (markup compartido del sitio). Incluye:

- `<title>`, `<meta name="description">` (de `product.description`), `<link rel="canonical">`
  a la URL del producto.
- OG/Twitter tags por producto (title, description, image principal, `og:type=product`).
- Contenido visible: imagen principal, nombre, precio, descripción, swatches de
  color y talles (solo display, sin interacción).
- `<script type="application/ld+json">` con schema `Product`:
  - `name`, `description`, `image` (array), `sku`/`mpn` = id.
  - `offers`: `@type Offer`, `price`, `priceCurrency: "ARS"`, `availability`
    (`InStock` si stock agregado > 0, si no `OutOfStock`), `url` de la página.
  - `brand`: `{ "@type": "Brand", "name": "VOLT" }`.
- CTA **"Comprar"** → `<a href="/pages/catalogo.html?product={id}">`.
- **Script de hidratación** (mínimo): carga Firebase compat + firestore, hace
  `get('products/{id}')`, y si el doc existe actualiza el precio visible y la línea
  de disponibilidad. Si falla o el producto no existe, deja el contenido horneado
  (degradación elegante). No re-renderiza variantes.

### Deep-link en el catálogo (`js/catalog.js`)

Al cargar, tras renderizar productos, leer `?product={id}` de la URL; si está
presente y el producto existe en la grilla, abrir el quick-view modal existente
para ese producto (misma función que usa el click en una card). Sin match →
no-op silencioso.

### Integración Vercel (`vercel.json`)

- Agregar `"buildCommand": "node scripts/gen-product-pages.mjs"`.
- Agregar `"outputDirectory": "."` para seguir sirviendo desde la raíz (el sitio
  no tiene carpeta `public`).
- `.gitignore`: agregar `producto/` (se regenera en cada build; no se commitea).
- **Riesgo a verificar en preview:** el comportamiento de `outputDirectory: "."`
  con un `buildCommand` en un proyecto sin framework. Validar en un **preview
  deploy** que (a) las páginas estáticas existentes siguen sirviéndose, y (b)
  `/producto/*.html` y `sitemap.xml` regenerados están disponibles, ANTES de
  promover a producción.

### Deploy Hook automático

- **Endpoint** `api/admin-redeploy.js`: protegido por `verifyAdmin`. Lee
  `VERCEL_DEPLOY_HOOK_URL` de env; si está, hace `POST` a esa URL (dispara un
  redeploy en Vercel). Devuelve `{ triggered: true }` o un warning si la env no
  está configurada (no es error fatal). El método es POST; sin admin → 401/403.
- **Admin** (`js/admin-products.js`): tras crear, editar, borrar o (des)activar un
  producto, llamar al endpoint (fire-and-forget con `VoltAdminAuth.getIdToken()` en
  el header `Authorization: Bearer`). Debounce simple (p. ej. 30s) para que una
  tanda de ediciones no encole varios builds; el último gana.
- **Secreto:** la URL del hook vive solo en env server-side. El cliente solo conoce
  el endpoint `/api/admin-redeploy`, que exige token admin.

## N2 — Checkout invitado (`js/pagos.js`)

- Quitar el gate de login en ambos handlers:
  - En `checkout-btn`: eliminar el bloque `if (window.VoltStoreAuth) { const user =
    await requireAuth(); if (!user) return; }`.
  - Ídem en `transfer-btn`.
- Se mantiene **toda** la recolección/validación de datos del modal (nombre, DNI,
  teléfono, email, dirección Andreani).
- Invitados: carrito solo en localStorage. `VoltCartSync.onCartChange` ya retorna
  temprano sin `uid`; `clearFirestore(undefined)` ya es no-op (`cartRef` devuelve
  null). `firebase.auth().currentUser?.uid` ya maneja `null`. No requiere cambios
  extra.
- El pre-llenado del modal desde `authUser` se mantiene para usuarios logueados;
  para invitados usa localStorage o queda vacío.
- "Mis pedidos" sigue disponible solo para usuarios que luego se registren con el
  mismo email (las reglas de `orders` ya leen por `token.email`). Sin cambios.

## N6 — DNI persistido

- `js/pagos.js` ya envía `customer` completo (incluye `dni`) en el `postBody` de
  ambos flujos. No requiere cambio (verificar que el objeto `customer` llega con
  `dni`).
- `api/create-preference.js` y `api/create-transfer-order.js`:
  - Validar server-side: `dni = String(customer.dni||'').trim()`, requerir
    `/^\d{7,8}$/`; si falta o es inválido → `400` con mensaje claro (mismo estilo
    que las demás validaciones de `customer`).
  - Guardar `dni` dentro del objeto `customer` de la orden:
    `customer: { name, phone, email, dni }`.
- El DNI ya aparece en el texto de WhatsApp (cliente). Opcional (fuera de v1):
  mostrarlo en el email al admin y en la vista de orden del panel.

## Flujo de datos

```
BUILD (Vercel)
  vercel buildCommand -> node scripts/gen-product-pages.mjs
    -> firebase-admin lee products activos
    -> por producto: renderProductPage() -> producto/{slug}-{id}.html
    -> regenera sitemap.xml
  Vercel sirve la raíz (outputDirectory ".") incl. /producto/*.html

VISITA a una página de producto (desde Google)
  HTML horneado + JSON-LD Product visible de entrada (indexable)
  -> script hidrata precio/disponibilidad desde Firestore
  -> CTA "Comprar" -> /pages/catalogo.html?product={id}
    -> catalog.js abre el quick-view del producto -> carrito existente

ADMIN cambia un producto
  crear/editar/borrar/(des)activar -> POST /api/admin-redeploy (Bearer admin)
    -> endpoint POST VERCEL_DEPLOY_HOOK_URL -> redeploy -> páginas frescas

CHECKOUT (invitado o logueado)
  sin gate de login -> modal recolecta datos (incl. DNI)
  -> create-preference / create-transfer-order valida DNI y lo guarda en la orden
```

## Manejo de errores

- **Build script:** si `firebase-admin` no puede inicializar (env faltante) o la
  lectura falla, el script debe **fallar el build** (exit ≠ 0) con un mensaje
  claro — mejor un deploy que falla que uno que sirve un catálogo vacío. Si un
  producto individual no puede renderizarse (dato corrupto), loguear y saltarlo
  sin abortar todo el build.
- **Hidratación:** try/catch; ante error deja el contenido del build (nunca rompe
  la página).
- **Deep-link:** si el id no matchea, no-op.
- **Deploy hook:** si `VERCEL_DEPLOY_HOOK_URL` no está, el endpoint responde ok con
  `triggered: false` y loguea warning; la operación del admin (crear/editar) no
  falla por esto. El llamado del admin es fire-and-forget: su error no bloquea el
  guardado del producto.
- **DNI:** validación server-side devuelve 400 con mensaje accionable; el cliente
  ya valida antes, esto es defensa en profundidad.

## Testing

- **`tests/product-page.test.mjs`** (nuevo): importar `renderProductPage` (o el
  módulo del template) y afirmar, sobre un producto fake, que el HTML contiene:
  `application/ld+json`, `"@type":"Product"`, el precio en `offers`, el
  `priceCurrency` `ARS`, el canonical correcto, y que `image` es un array cuando el
  producto tiene varias imágenes. Afirmar `slugify` (acentos/espacios).
- **Estructural** (estilo `tests/coupons-integration.test.mjs`): que
  `create-preference.js` y `create-transfer-order.js` incluyan `dni` en el
  `customer` guardado y su validación; que `vercel.json` tenga el `buildCommand`;
  que `js/pagos.js` ya no contenga el gate `requireAuth` en el flujo de compra.
- **N2** (quitar un gate) no se testea de forma automatizada más allá del check
  estructural anterior.
- Verificación manual post-deploy (preview primero): output de Vercel, indexación
  del JSON-LD (Rich Results Test), deep-link del CTA, compra como invitado, DNI en
  la orden, y que el deploy hook dispara al editar un producto.

## Fuera de alcance (YAGNI)

- Galería visual multi-imagen y productos relacionados en la página (v2; no tocan
  JSON-LD ni build).
- Página de producto como checkout completo (se eligió landing + deep-link).
- Mostrar DNI en email admin / vista de orden del panel (opcional, no bloquea N6).
- Paginación del catálogo, breadcrumbs schema, reviews/rating en JSON-LD.
- Invalidación incremental (solo regenerar el producto que cambió): v1 regenera
  todo el catálogo en cada build (simple; el catálogo es chico).
