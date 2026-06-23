# Catálogo — Modal Quick-View (diseño)

**Fecha:** 2026-06-23
**Archivos afectados:** `js/catalog.js`, `css/volt-ds.css` (estilos del modal)

## Problema

En `pages/catalogo.html` cada `.product-card` despliega un panel `.product-expanded`
inline al tocar "Ver producto" (`card.classList.toggle('is-expanded')`,
`catalog.js:330`). Como las filas del grid alinean su alto al ítem más alto, expandir
una card empuja/estira al resto de la fila → "bajan todas". Mala UX.

## Objetivo

Mover el detalle de compra (galería + color + talle + cantidad + stock + añadir/finalizar)
a un **modal quick-view** centrado. Las cards de la grilla quedan compactas y de alto
fijo, sin desplegar nada inline. La grilla nunca se mueve.

## Enfoque elegido

Modal vanilla propio, mismo patrón y estética que el `product-lightbox` existente
(overlay oscuro, esquinas rectas, borde DS). Sin Bootstrap modal, sin páginas por
producto. Reutiliza las funciones de render existentes y la lógica de stock/carrito.

## Layout

**Desktop — 2 columnas:** foto + galería (‹ ›, dots) a la izquierda; a la derecha
título, precio, tag, descripción, color, talle, cantidad, stock, "Añadir al carrito" y
"Finalizar compra".

**Mobile — apilado:** foto arriba (‹ ›, dots), debajo título/precio/desc, luego
color → talle → cantidad → stock → botones. Scroll interno del diálogo si no entra.

## Comportamiento

- Abre con tap en "Ver producto →" o en la card (fuera de botones/inputs).
- Cierra con `×`, tap en backdrop, o `Esc`.
- Bloquea scroll del body mientras está abierto (clase en `body`, como `lightbox-open`).
- Tocar la foto del modal abre el `product-lightbox` de zoom existente **por encima**
  del modal (z-index mayor); reutiliza su galería y navegación. No se anida lógica nueva.
- Toda la lógica de selección de color/talle/cantidad, cálculo de stock y add/remove del
  carrito se mantiene idéntica; solo opera sobre el DOM del modal en vez de la card.

## Arquitectura / refactor

Hoy `initCardInteractions(card, product)` (`catalog.js:264`) mezcla la card con toda la
lógica de compra. Se separa en dos responsabilidades:

1. **Card compacta** (`createProductCard`): imagen + índice + badge + título + precio +
   tag + botón "Ver producto →". Se elimina el bloque `.product-expanded` del markup. Su
   único listener relevante abre el quick-view. La imagen sigue abriendo el lightbox.

2. **`openQuickView(product)`**: crea/llena un overlay `.product-quickview` con la galería
   y los controles de compra (reusa `renderColorSelector`, `renderSizeSelector`,
   `renderQuantitySelector`). Cablea swatches/talles/cantidad/add/finalizar y
   `refreshState` sobre el DOM del modal. El estado seleccionado (color/talle/cantidad)
   vive en el modal mientras está abierto.

La lógica común de `refreshState` / add-to-cart se factoriza para operar sobre un
contenedor parametrizable (el modal), evitando duplicar código.

Un único modal reutilizable, repoblado por producto al abrir.

## Fuera de alcance (YAGNI)

- Páginas de producto dedicadas.
- Swipe táctil dentro de la galería del modal (los botones ‹ › alcanzan; ya se decidió
  no implementar swipe en el lightbox).
- Deep-linking por producto (URL por producto).

## Criterios de éxito

- Expandir un producto nunca altera el alto ni la posición de las demás cards.
- Se puede elegir color/talle/cantidad y añadir/eliminar del carrito desde el modal, con
  el stock actualizándose igual que hoy.
- La foto del modal abre el zoom (lightbox) con su galería.
- Cierre por ×, backdrop y Esc; scroll del body bloqueado mientras está abierto.
- Estética consistente con el DS (negro/blanco/#c1121f, esquinas rectas).
