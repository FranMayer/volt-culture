# Promo 2x1 — línea TC

**Fecha:** 2026-08-17
**Estado:** aprobado, pendiente de implementación

## Qué se construye

Dos buzos al precio de uno sobre los productos que el admin marque. La promo
corre mientras haya stock; se prende y se apaga desde el panel. No lleva
contador propio, ni fecha de vencimiento, ni cupo — el stock lo maneja Franco a
mano desde el admin.

## Decisiones tomadas

| Decisión | Elegida | Descartadas |
|---|---|---|
| Alcance | Flag `promo2x1` por producto, tildado en el admin | Regla automática por línea+categoría; colección `promos/` |
| Regla | De cada par, el **más barato** gratis. Aplica a todos los pares del carrito | Un solo par por orden; el más caro gratis |
| Acumulación | Acumula con el 10% de transferencia. **Bloquea** cupones | Acumula con todo; excluyente (gana el mayor) |

## Por qué el modelo actual no alcanza

Hoy una orden tiene **un** descuento y es excluyente:
`discountSource: 'coupon' | 'transfer' | null` (`lib/types.ts:143`), un
porcentaje sobre el total. El 10% de transferencia y los cupones compiten por
ese mismo campo (`create-transfer-order.js:214-225`).

Un 2x1 no entra ahí por dos razones: es **item-level** (depende de qué hay en el
carrito y de a pares, no de un % sobre el total) y **coexiste** con el 10% de
transferencia, o sea que una orden pasa a tener dos descuentos simultáneos.

Además el cálculo del total está **triplicado**: `lib/checkout.js` (lo que se
muestra), `create-preference.js` (lo que cobra MercadoPago) y
`create-transfer-order.js` (lo que se cobra por transferencia). Si los tres no
coinciden, el cliente ve un precio y paga otro.

## Arquitectura

Un módulo puro nuevo, `lib/promo2x1.js`, calcado de `lib/server/coupons.js`: sin
red, sin Firestore, recibe items y devuelve números. Lo consumen los tres
lugares que hoy duplican la cuenta. `.js` y no `.ts` para que los tests lo
importen sin loader, igual que `coupons.js`.

```
                    lib/promo2x1.js  (puro, testeable)
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
  lib/checkout.js    create-preference.js  create-transfer-order.js
   (lo que muestra)   (lo que cobra MP)     (lo que cobra transfer.)
```

**El servidor siempre recalcula desde el precio y el flag de Firestore.** El
cliente nunca manda el descuento; lo que manda se ignora. Los dos endpoints ya
releen cada producto (`create-preference.js:191`), así que el flag está
disponible sin queries nuevas.

### Orden de las operaciones

```
productsTotal          precio de Firestore, no del cliente
  − descuento2x1       el más barato de cada par entre los items con promo2x1
  + envío
  = subtotal
  − 10% transferencia  sobre el subtotal que YA tiene el 2x1 aplicado
  = total
```

Si hay algún item con `promo2x1` en el carrito, el cupón se rechaza y el
checkout muestra "no acumulable con la promo 2x1".

### La regla, precisa

1. Filtrar los items con `promo2x1 === true`, **expandidos por cantidad** (una
   línea con `quantity: 3` son tres unidades).
2. Ordenar las unidades por precio descendente.
3. Recorrer de a pares: la unidad en posición impar (0-indexed: 1, 3, 5…) es
   gratis.
4. El descuento es la suma de las unidades gratis.

Unidades sueltas (cantidad impar) se pagan. Un carrito con un solo buzo en promo
no tiene descuento.

## Contrato de `lib/promo2x1.js`

```js
/**
 * @param {Array<{price:number, quantity:number, promo2x1?:boolean}>} items
 * @returns {{ descuento:number, unidadesGratis:number, unidadesEnPromo:number }}
 */
export function computePromo2x1(items)

/** ¿Hay al menos un item en promo? Decide el bloqueo de cupones. */
export function tienePromo2x1(items)
```

Sin estado, sin fechas, sin Firestore. Todo lo que necesita entra por `items`.

## El punto riesgoso: los ítems de MercadoPago

`create-preference.js:281` le manda a MP una línea por línea de carrito con
`unit_price` y `quantity`. **La suma de esas líneas es lo que MP efectivamente
cobra.** Si no coincide con el `total` guardado en la orden, el cliente paga
distinto de lo que dice el checkout.

Un 2x1 no se puede expresar como un `unit_price` uniforme cuando los precios se
mezclan o las cantidades son impares. El algoritmo:

1. Repartir el descuento entre las líneas en promo, proporcional al total de
   cada línea, redondeando a entero.
2. Calcular el residuo de redondeo contra el descuento real.
3. Absorber el residuo en la línea de mayor precio. Si su `quantity > 1` impide
   ajustarlo exacto vía `unit_price`, **partir esa línea en dos ítems de MP**
   (`quantity: n-1` a un precio y `quantity: 1` al precio ajustado).

MP no acepta `unit_price` negativo ni una línea de descuento, y no se asume que
acepte `0` — por eso se ajustan precios en vez de agregar una línea gratis.

**Invariante, no negociable:** `sum(mpItems.unit_price × quantity) === total`.
Esto lleva test propio.

## Cambio de forma en el documento de orden

Hoy la orden guarda `discountPercent`, `discountAmount`, `coupon`,
`discountSource`. Con 2x1 + transferencia hay dos descuentos a la vez.

Se **agrega** un array con el desglose y se **mantiene** todo lo existente:

```js
discounts: [
  { source: 'promo2x1', amount: 45000, detail: '2x1 — 1 unidad gratis' },
  { source: 'transfer', amount: 4500, percent: 10 }
]
discountAmount: 49500      // la suma — las órdenes viejas se siguen leyendo igual
discountSource: 'promo2x1' // el principal, para los lectores que esperan un solo valor
```

Nada que hoy lee `discountAmount` o `discountSource` se rompe: las órdenes
anteriores no tienen `discounts` y siguen siendo válidas.

## Archivos

| Archivo | Cambio |
|---|---|
| `lib/promo2x1.js` | **nuevo** — la regla pura |
| `lib/types.ts` | `promo2x1?: boolean` en `Product` y en `CartItem`; `'promo2x1'` en `discountSource`; tipo `discounts[]` |
| `components/admin/ProductFormModal.tsx` | checkbox, calcado de `limited` (líneas 82, 116, 130, 281, 395) |
| `components/catalog/ProductCard.tsx` | sello "2x1", calcado de `product-badge-limited` (línea 48) |
| `app/styles/*.css` | estilo del sello |
| `components/catalog/ProductDetail.tsx` | pasa `promo2x1` al `addItem` (línea 75) |
| `components/catalog/QuickViewModal.tsx` | ídem (línea 107) |
| `lib/checkout.js` | 2x1 en el total mostrado y en la línea del mensaje de WhatsApp |
| `pages/api/create-preference.js` | 2x1 + reparto de `unit_price` + bloqueo de cupón |
| `pages/api/create-transfer-order.js` | 2x1 + bloqueo de cupón |
| `components/checkout/CheckoutModal.tsx` | línea de descuento y aviso de cupón bloqueado |
| `tests/promo2x1.test.mjs` | **nuevo** |

## Limitación conocida y aceptada

El carrito guarda una copia del item en `localStorage` (`lib/cart/reducer.js:23`
hace spread del item). Si se **destilda** la promo de un producto, los carritos
ya guardados van a seguir mostrando el descuento en el drawer hasta que el
cliente llegue al checkout, donde el servidor devuelve los totales reales y
corrige.

Se acepta porque el servidor es la autoridad y el patrón ya existe
(`CheckoutModal.tsx:366` muestra lo que devuelve el server). El techo: si algún
día molesta, el fix es que el checkout relea los flags de Firestore para los ids
del carrito antes de mostrar el total.

CLAUDE.md exige que el shape del item de carrito sobreviva en `localStorage`.
`promo2x1` es **opcional**: un carrito viejo sin el campo se lee igual, queda
falsy, y no rompe nada.

## Tests

`tests/promo2x1.test.mjs`, sin framework, estilo `tests/brain.test.mjs`:

- 2 buzos mismo precio → uno gratis
- 3 buzos → uno gratis, el impar se paga
- 4 buzos precios mixtos → los dos más baratos de cada par
- 1 solo buzo → sin descuento
- carrito sin items en promo → descuento 0
- items en promo mezclados con items normales → los normales no afectan
- `quantity: 2` en una sola línea → cuenta como dos unidades
- **el invariante de MercadoPago**: la suma de los ítems es igual al total
- 2x1 + 10% transferencia → el 10% corre sobre el subtotal ya descontado
- cupón + 2x1 → el cupón se rechaza

## Fuera de alcance

- Contador de stock propio de la promo, fecha de vencimiento, cupo máximo
- Promos de otra forma (3x2, % por línea) — este diseño no las generaliza
- Deduplicar el cálculo de totales triplicado más allá de lo que toca el 2x1
