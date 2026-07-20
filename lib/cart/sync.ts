/**
 * lib/cart/sync.ts — transcripción de legacy/js/cart-sync.js.
 *
 * Sincroniza el carrito (lib/cart/store.ts, Zustand) con Firestore
 * `users/{uid}/cart/current` (ruta exacta, ver cartRef() abajo == legacy
 * cart-sync.js:24 `db.collection('users').doc(uid).collection('cart').doc('current')`).
 *
 * Diferencias deliberadas vs. el original (misma semántica, distinto host):
 *  - legacy engancha onCartChange() a mano al final de main.js#updateCart();
 *    acá se usa `useCartStore.subscribe()` (decisión cerrada del plan F3:
 *    "vive fuera de React, subscribe() es transcripción casi 1:1").
 *  - legacy lee/escribe `localStorage['cart']` directo (getLocal/setLocal);
 *    acá se lee/escribe el store de Zustand (`useCartStore.getState()` /
 *    `.setState()`), que ya persiste a localStorage vía el middleware
 *    `persist` de store.ts — mismo resultado observable.
 *  - legacy dispara `window.dispatchEvent(new CustomEvent('cartUpdated'))`
 *    tras mergear/limpiar; acá no hace falta: `setState()` ya notifica a
 *    todo componente suscripto al store (reactividad de Zustand reemplaza
 *    el evento global, tal como indica CLAUDE.md "Qué NO migrar").
 *
 * El resto (debounce 800ms, guard `_syncing`, fórmula de merge Math.max)
 * es transcripción literal — ver comentarios de línea abajo.
 */
"use client";

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { useCartStore } from "./store";
import { mergeCartItems } from "./reducer.js";
import type { CartItem } from "@/lib/types";

const DEBOUNCE_MS = 800; // legacy cart-sync.js:83

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let syncing = false; // legacy cart-sync.js:17 `_syncing` — evita writes durante el merge de login

/** Ruta exacta de legacy cart-sync.js:21-25 `cartRef(uid)`. */
function cartRef(uid: string) {
    return doc(db, "users", uid, "cart", "current");
}

/**
 * Llamado en cada cambio del carrito local (vía store.subscribe, ver
 * startCartSync()). Transcripción de legacy cart-sync.js:70-84 `onCartChange`.
 */
export function onCartChange(items: CartItem[]): void {
    if (syncing) return; // legacy:71 — merge en curso, ignorar
    const uid = auth.currentUser?.uid;
    if (!uid) return; // legacy:72-73 — sin sesión, no persistir

    if (debounceTimer) clearTimeout(debounceTimer); // legacy:75
    debounceTimer = setTimeout(() => {
        const ref = cartRef(uid);
        setDoc(ref, { items, updatedAt: serverTimestamp() }).catch((err) => {
            console.warn("[CartSync] Error al guardar:", err instanceof Error ? err.message : err);
        });
    }, DEBOUNCE_MS); // legacy:76-83
}

/**
 * Llamado en login (una vez por sesión, guard en lib/auth.ts — mismo
 * mecanismo que legacy store-auth.js:57-63 `mergeKey`/sessionStorage).
 * Transcripción de legacy cart-sync.js:93-120 `loadAndMerge`.
 */
export async function loadAndMerge(uid: string): Promise<void> {
    const ref = cartRef(uid);

    syncing = true; // legacy:97
    try {
        const snap = await getDoc(ref); // legacy:99
        const firestoreItems: CartItem[] = snap.exists() ? (snap.data().items as CartItem[] | undefined) || [] : []; // legacy:100
        const localItems = useCartStore.getState().items; // legacy:101 getLocal()

        // legacy:104 — si ambos están vacíos no hay nada que hacer
        if (firestoreItems.length === 0 && localItems.length === 0) return;

        const merged = mergeCartItems(firestoreItems, localItems); // legacy:106
        useCartStore.setState({ items: merged }); // legacy:107-108 setLocal() + dispatchEvent('cartUpdated')

        // legacy:110-114 — persistir el resultado del merge
        await setDoc(ref, { items: merged, updatedAt: serverTimestamp() });
    } catch (err) {
        console.warn("[CartSync] Error al cargar carrito:", err instanceof Error ? err.message : err); // legacy:116
    } finally {
        syncing = false; // legacy:118
    }
}

/**
 * Llamado antes de redirigir a Mercado Pago (F7 — pagos.js aún no migrado).
 * Transcripción de legacy cart-sync.js:126-137 `clearFirestore`. Se porta
 * ahora por fidelidad de API de cart-sync.js; sin caller hasta F7.
 */
export async function clearFirestore(uid: string): Promise<void> {
    const ref = cartRef(uid);
    try {
        await setDoc(ref, { items: [], updatedAt: serverTimestamp() });
    } catch (err) {
        console.warn("[CartSync] Error al limpiar Firestore:", err instanceof Error ? err.message : err);
    }
}

/**
 * Transcripción de legacy cart-sync.js:143-147 `clearLocal` (limpia el
 * carrito local y cancela el debounce pendiente). NO se invoca en logout —
 * decisión explícita de la tarea F3b (distinta de legacy, que sí borra el
 * carrito local al cerrar sesión): el carrito local debe sobrevivir el
 * logout. Se conserva acá por fidelidad de API; sin caller en F3b.
 */
export function clearLocal(): void {
    if (debounceTimer) clearTimeout(debounceTimer); // legacy:144
    useCartStore.setState({ items: [] }); // legacy:145-146
}

/**
 * Engancha el store de Zustand a onCartChange (adaptación de "vive fuera de
 * React" — ver comentario de cabecera). Debe montarse una sola vez (ver
 * components/auth/AuthProvider.tsx); devuelve cleanup.
 *
 * Idempotencia bajo StrictMode: cada llamada crea una suscripción Zustand
 * nueva y devuelve su propio unsubscribe — React invoca setup→cleanup→setup
 * en dev, así que la primera suscripción siempre se cierra antes de abrir la
 * segunda (subscribe/unsubscribe de Zustand no tiene estado global propio
 * que pueda quedar duplicado). `debounceTimer`/`syncing` sí son módulo-
 * singleton por diseño (igual que los closures de legacy cart-sync.js), lo
 * cual es seguro: cleanup cancela el timer pendiente antes de que un efecto
 * duplicado pueda pisarlo.
 */
export function startCartSync(): () => void {
    const unsubscribe = useCartStore.subscribe((state) => {
        onCartChange(state.items);
    });

    return () => {
        unsubscribe();
        if (debounceTimer) clearTimeout(debounceTimer);
    };
}
