/**
 * lib/cart/store.ts — carrito local (Zustand + persist).
 *
 * Reemplaza la lógica de `cart`/`updateCart()` en legacy/js/main.js.
 * Sync a Firestore (legacy/js/cart-sync.js) llega en F3b — este store solo
 * maneja el estado local + persistencia en localStorage. La reducción pura
 * (addItem/removeItem/setQty/cartCount/cartSubtotal) vive en ./reducer.js
 * (plain JS) para que tests/cart-store.test.mjs la importe sin loader TS.
 */
import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import * as reducer from './reducer.js';
import type { CartItem } from '@/lib/types';

interface PersistedCart {
    items: CartItem[];
}

interface CartState extends PersistedCart {
    addItem: (item: CartItem, qty?: number) => void;
    removeItem: (lineKey: string) => void;
    setQty: (lineKey: string, qty: number) => void;
    clear: () => void;
}

/**
 * COMPATIBILIDAD LEGACY (crítico, ver legacy/js/main.js:8 y cart-sync.js:27-33):
 * hoy `localStorage['cart']` guarda un ARRAY RAW de CartItem —
 * `JSON.parse(localStorage.getItem('cart')) || []` — sin ningún wrapper.
 * El storage default de zustand/persist en cambio escribe `{state, version}`.
 * Este storage custom detecta el formato en `getItem`: si es un array, es un
 * carrito legacy (se adopta tal cual como `items`); si es un objeto, ya es
 * el formato de zustand (carrito migrado en una sesión previa). Así los
 * carritos existentes sobreviven el cutover. `setItem` siempre escribe en
 * formato zustand de acá en adelante (la key `'cart'` no cambia).
 */
const legacyCompatStorage: PersistStorage<PersistedCart> = {
    getItem: (name) => {
        if (typeof window === 'undefined') return null;
        const raw = localStorage.getItem(name);
        const items = reducer.parseCartStorage(raw) as CartItem[] | null;
        if (items === null) return null;
        return { state: { items }, version: 0 } satisfies StorageValue<PersistedCart>;
    },
    setItem: (name, value) => {
        if (typeof window === 'undefined') return;
        localStorage.setItem(name, JSON.stringify(value));
    },
    removeItem: (name) => {
        if (typeof window === 'undefined') return;
        localStorage.removeItem(name);
    },
};

export const useCartStore = create<CartState>()(
    persist(
        (set) => ({
            items: [],

            addItem: (item, qty = 1) => {
                set((state) => ({ items: reducer.addItem(state.items, item, qty) }));
            },

            removeItem: (lineKey) => {
                set((state) => ({ items: reducer.removeItem(state.items, lineKey) }));
            },

            setQty: (lineKey, qty) => {
                set((state) => ({ items: reducer.setQty(state.items, lineKey, qty) }));
            },

            clear: () => set({ items: [] }),
        }),
        {
            name: 'cart',
            storage: legacyCompatStorage,
            partialize: (state) => ({ items: state.items }),
        }
    )
);

export function cartCount(items: CartItem[]): number {
    return reducer.cartCount(items);
}

export function cartSubtotal(items: CartItem[]): number {
    return reducer.cartSubtotal(items);
}
