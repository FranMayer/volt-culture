# Diseño: Cupones de descuento — VOLT Culture

**Fecha:** 2026-06-24
**Estado:** Aprobado (brainstorming)

## Objetivo

Permitir que un cliente ingrese un código de cupón (palabra que VOLT entrega a
seguidores en Instagram) durante el checkout y obtenga un descuento porcentual
sobre los productos. El descuento **no es acumulable** con el descuento por
transferencia: si hay cupón válido, el cupón **reemplaza** al −10% de
transferencia.

Primer cupón a cargar: **`VOLT20` = 20%** sobre productos.

## Decisiones (definidas en brainstorming)

1. **Gestión:** colección `coupons` en Firestore + tab de administración en el
   panel admin (crear / activar-desactivar / borrar, sin deploy).
2. **No acumulable:** en transferencia, el cupón **reemplaza** al −10% (se usa el
   % del cupón aunque sea distinto; nunca se suman).
3. **Tipo de descuento:** porcentaje, aplicado **solo sobre el total de
   productos** (no sobre el costo de envío).

### Supuestos confirmados

- El input del cupón es un **input de una línea + botón "Aplicar"** (no un
  `textarea`).
- El cupón **funciona en ambos métodos de pago**: en Mercado Pago es el único
  descuento; en transferencia reemplaza al −10%.
- Versión inicial **sin límite de usos** (solo `active` + `expiresAt` opcional).
  El conteo de usos queda como extensión futura.

## Modelo de datos — colección `coupons`

Doc ID = código normalizado (mayúsculas, sin espacios). Ej: `coupons/VOLT20`.

| Campo        | Tipo                | Notas                                  |
|--------------|---------------------|----------------------------------------|
| `code`       | string              | código tal cual se muestra (ej `VOLT20`) |
| `percent`    | number              | entero 1–100, % sobre productos        |
| `active`     | boolean             | on/off sin borrar                      |
| `expiresAt`  | timestamp \| null   | vencimiento opcional                   |
| `createdAt`  | timestamp           | serverTimestamp al crear               |
| `updatedAt`  | timestamp           | serverTimestamp en cada edición        |

### Normalización del código

`String(code).trim().toUpperCase()` y se quitan espacios internos. El doc ID y el
campo `code` se guardan ya normalizados. El cliente y los backends normalizan de
la misma forma antes de buscar el documento.

### Reglas Firestore (`firestore.rules`)

```
match /coupons/{couponId} {
  allow read: if true;                                  // preview en checkout
  allow write: if request.auth != null
               && request.auth.token.admin == true;     // mismo patrón que products
}
```

## Validación de cupón (cliente y servidor)

Un cupón es **válido** cuando:

- el documento existe,
- `active === true`,
- `expiresAt` es `null` o una fecha futura,
- `percent` es un entero entre 1 y 100.

Si no es válido: el cliente muestra feedback inline y no aplica descuento. El
servidor, ante un cupón inválido/ausente, hace fallback al comportamiento sin
cupón (transferencia → −10%; MP → sin descuento) y devuelve los totales reales
aplicados.

## Cálculo del descuento

- `productsTotal = Σ (price × quantity)` (precios de servidor).
- **Con cupón válido:** `discountAmount = round(productsTotal × percent / 100)`,
  `discountSource = 'coupon'`. Aplica igual en MP y en transferencia.
- **Sin cupón, transferencia:** `discountAmount = round(subtotal × 0.10)` sobre
  `subtotal = productsTotal + shippingCost` (comportamiento actual),
  `discountSource = 'transfer'`.
- **Sin cupón, MP:** sin descuento, `discountSource = null`.

El redondeo (`Math.round`) se mantiene consistente entre frontend y backend, igual
que hoy.

## Componentes

### 1. `api/_coupons.js` (nuevo, helper compartido y testeable)

Funciones puras, sin dependencias de red salvo el fetch del doc que se inyecta:

- `normalizeCouponCode(code) -> string`
- `isCouponValid(couponData, now) -> { valid: boolean, reason?: string }`
- `computeCouponDiscount(productsTotal, percent) -> number` (con `Math.round`)

El fetch del documento Firestore se hace en cada endpoint (Admin SDK) y se pasa
el `data` a estas funciones, para poder testearlas sin Firestore.

### 2. `api/create-transfer-order.js`

- Acepta `body.couponCode`.
- Si viene, normaliza, hace `db.collection('coupons').doc(code).get()`, valida con
  `_coupons.js`.
- Cupón válido → `discountAmount = round(productsTotal × percent/100)`,
  `discountPercent = percent`, `discountSource = 'coupon'`, `coupon = code`,
  `total = subtotal - discountAmount`.
- Cupón inválido/ausente → lógica actual (−10% sobre subtotal),
  `discountSource = 'transfer'`, `coupon = null`.
- La orden guarda: `coupon`, `discountSource`, `discountPercent`,
  `discountAmount`, `subtotal`, `total`.
- La respuesta JSON suma `coupon`, `discountSource` a lo que ya devuelve.

### 3. `api/create-preference.js`

- Acepta `body.couponCode`. Misma búsqueda/validación.
- Cupón válido → cada producto entra a MP con
  `unit_price = round(price × (100 - percent) / 100)`. El envío Córdoba se
  mantiene a precio completo. `discountAmount = productsTotal - Σ(unitPriceDesc × qty)`,
  `total = Σ(productos con descuento) + shippingCost` (= lo que cobra MP).
- Cupón inválido/ausente → comportamiento actual (sin descuento).
- La orden ahora guarda también `subtotal`, `discountPercent`, `discountAmount`,
  `coupon`, `discountSource` (antes solo `total`).

### 4. Checkout — `js/pagos.js` + `pages/catalogo.html`

- En el **paso 3** del modal de checkout, arriba de los totales del resumen:
  - `<input id="checkoutCouponInput">` (una línea, mayúsculas) + botón
    `#checkoutCouponApply` ("Aplicar") + `<div id="checkoutCouponFeedback">`.
- Estado del cupón en variable de módulo `_couponAplicado` (espejo de
  `_shippingConfirmado`): `{ code, percent } | null`.
- **Aplicar:** lee `firebase.firestore().collection('coupons').doc(code).get()`,
  valida con la misma lógica (el proyecto no tiene bundler, así que el navegador
  no puede importar `api/_coupons.js`; se **duplica la validación mínima inline**
  en `pagos.js` — son pocas líneas: `active`, `expiresAt`, `percent`), guarda
  estado, re-renderiza el resumen y muestra feedback.
- **Quitar:** botón/acción para limpiar el cupón y volver al estado normal.
- `renderSummary(...)` (función existente que arma el resumen):
  - **MP con cupón:** Productos / Envío / `Cupón {code} (−{percent}%)` / Total.
  - **Transferencia con cupón:** se reemplaza la línea
    `Descuento transferencia (−10%)` por `Cupón {code} (−{percent}%)`
    calculada sobre productos.
  - Sin cupón: comportamiento actual.
- En los handlers de pago (botón MP y botón transferencia) se agrega
  `couponCode: _couponAplicado?.code` al body del fetch.

### 5. Admin — `js/admin-coupons.js` (nuevo) + tab en `admin/panel.html`

- Nueva tab "Cupones" junto a Productos / Pedidos / Configuración (mismo patrón
  `data-tab` + `.tab-content`).
- Módulo espejo de `admin-products.js` (compat SDK, `firebase.firestore()`):
  - **Listar** cupones (código, %, estado, vencimiento).
  - **Crear**: código + % (+ vencimiento opcional). Normaliza el código y usa
    `.doc(code).set(...)` con `serverTimestamp`.
  - **Activar/Desactivar**: toggle de `active` con `.update({ active, updatedAt })`.
  - **Borrar**: `.doc(code).delete()`.
- Carga inicial del cupón `VOLT20` (20%, activo) puede hacerse desde esta misma
  UI una vez deployada.

### 6. Mensaje de WhatsApp y emails

- `buildTransferWaUrl(...)` muestra `Descuento cupón {code} ({percent}%)` en lugar
  de `Descuento 10% transferencia` cuando `discountSource === 'coupon'` (usa los
  totales del servidor, que ya se pasan hoy vía `serverTotals`).
- `api/_shipping-email.js`: misma adaptación de la línea de descuento según
  `discountSource` / `coupon` de la orden.

## Flujo de datos (resumen)

```
Cliente ingresa código en paso 3
  -> lee coupons/{CODE} (Firestore, read público)
  -> valida active + expiresAt + percent
  -> guarda _couponAplicado, re-renderiza resumen (preview)

Cliente paga (MP o transfer)
  -> fetch al endpoint con couponCode
  -> backend re-busca coupons/{CODE} (Admin SDK) y re-valida  [FUENTE DE VERDAD]
  -> calcula discount sobre productos (o fallback)
  -> crea orden con coupon/discountSource/discountPercent/discountAmount/total
  -> (MP) crea preferencia con unit_price descontado
  -> responde totales reales -> WhatsApp/redirect usan esos totales
```

## Manejo de errores

- Cupón inexistente / inactivo / vencido / % inválido → feedback inline en
  checkout, sin aplicar descuento. Backend hace fallback seguro.
- El backend **nunca** confía en el monto de descuento enviado por el cliente:
  solo recibe el `couponCode` y recalcula todo.
- Si el cupón se desactiva entre el preview y el pago, el backend lo detecta y
  cobra sin el descuento del cupón (fallback), devolviendo los totales reales.

## Testing

`api/_coupons.js` con tests unitarios (estilo `tests/transfer-flow.test.js`):

- cupón válido → descuento correcto sobre productos;
- cupón inactivo → inválido;
- cupón vencido → inválido;
- `percent` fuera de rango (0, 101, no entero) → inválido;
- normalización de código (espacios, minúsculas);
- reemplazo del −10% en transferencia cuando hay cupón;
- descuento aplicado solo sobre productos (no toca envío).

## Fuera de alcance (extensiones futuras)

- Límite de usos por cupón / conteo de redenciones.
- Cupones de monto fijo (solo porcentaje por ahora).
- Cupones por usuario o de un solo uso.
- Acumulación con otros descuentos.
