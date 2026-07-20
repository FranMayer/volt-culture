/**
 * Reducción pura del carrito (sin Zustand ni localStorage) — usada por
 * lib/cart/store.ts y por tests/cart-store.test.mjs directamente.
 * .js (no .ts), mismo motivo que lib/server/stock.js: que el test lo
 * importe con `node` plano, sin loader TS.
 *
 * lineKey() replica textualmente cartLineKey() de lib/types.ts
 * (`${id}-${color}-${size}`, ver legacy/js/cart-sync.js) — mantener ambas
 * en sync si la fórmula cambia.
 */

export function lineKey(item) {
    return `${item.id || ''}-${item.variantColor || ''}-${item.variantSize || ''}`;
}

/** Agrega `item` con cantidad `qty`; si ya existe la misma línea, suma qty. */
export function addItem(items, item, qty = 1) {
    const key = lineKey(item);
    const existing = items.find((i) => lineKey(i) === key);
    if (existing) {
        return items.map((i) => (lineKey(i) === key ? { ...i, quantity: i.quantity + qty } : i));
    }
    return [...items, { ...item, quantity: qty }];
}

export function removeItem(items, key) {
    return items.filter((i) => lineKey(i) !== key);
}

/** qty <= 0 elimina la línea (misma semántica que legacy: index.splice en updateCart). */
export function setQty(items, key, qty) {
    if (qty <= 0) return removeItem(items, key);
    return items.map((i) => (lineKey(i) === key ? { ...i, quantity: qty } : i));
}

export function cartCount(items) {
    return items.reduce((sum, i) => sum + i.quantity, 0);
}

export function cartSubtotal(items) {
    return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

/**
 * Lee el valor crudo de `localStorage['cart']` y devuelve el array de items,
 * soportando los dos formatos posibles:
 *  - legacy (ver legacy/js/main.js:8, cart-sync.js:27-33): array raw de
 *    CartItem, `JSON.parse(localStorage.getItem('cart')) || []`.
 *  - zustand/persist (a partir de que este store escribe la key): objeto
 *    `{state:{items:[...]}, version}`.
 * Devuelve null si no hay nada guardado o el valor es inválido.
 */
export function parseCartStorage(raw) {
    if (!raw) return null;
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.state?.items)) return parsed.state.items;
    return null;
}
