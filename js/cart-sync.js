/**
 * VOLT — Cart Sync
 * Sincroniza el carrito entre localStorage y Firestore /users/{uid}/cart/current.
 * Se conecta al carrito existente a través de window.VoltCartSync (no reemplaza su lógica).
 *
 * Puntos de integración:
 *   main.js       → VoltCartSync.onCartChange(items)  al final de updateCart()
 *   store-auth.js → VoltCartSync.loadAndMerge(uid)    en onAuthStateChanged cuando user != null
 *                   VoltCartSync.clearLocal()          en onAuthStateChanged cuando user == null
 *   pagos.js      → VoltCartSync.clearFirestore(uid)  antes de redirigir a Mercado Pago
 */

(function () {
    'use strict';

    let _debounceTimer = null;
    let _syncing       = false;   // evita writes durante el merge de login

    // ── Helpers ───────────────────────────────────────────────────────────

    function cartRef(uid) {
        const db = window.FirebaseConfig?.getDb();
        if (!db || !uid) return null;
        return db.collection('users').doc(uid).collection('cart').doc('current');
    }

    function getLocal() {
        try { return JSON.parse(localStorage.getItem('cart')) || []; } catch { return []; }
    }

    function setLocal(items) {
        localStorage.setItem('cart', JSON.stringify(items));
    }

    function lineKey(item) {
        const id = item.id || '';
        const c = item.variantColor || '';
        const s = item.variantSize || '';
        return `${id}-${c}-${s}`;
    }

    /**
     * Mergea dos arrays de items. Misma línea = mismo id + color + talle.
     * Usa Math.max en vez de sumar para evitar duplicación cuando local y
     * Firestore ya están sincronizados (ej: refresh de página).
     * Solo agrega items que existan únicamente en local (sesión anónima previa).
     */
    function merge(firestoreItems, localItems) {
        const result = firestoreItems.map(item => ({ ...item }));
        for (const local of localItems) {
            const existing = result.find(m => lineKey(m) === lineKey(local));
            if (existing) {
                existing.quantity = Math.max(existing.quantity || 0, local.quantity || 0);
            } else {
                result.push({ ...local });
            }
        }
        return result;
    }

    // ── API pública ────────────────────────────────────────────────────────

    const VoltCartSync = {

        /**
         * Llamado por main.js al final de updateCart().
         * Escribe en Firestore con debounce de 800ms para no disparar
         * un write por cada cambio rápido (ej: agregar varios items).
         */
        onCartChange(items) {
            if (_syncing) return;                              // merge en curso, ignorar
            const uid = firebase.auth().currentUser?.uid;
            if (!uid) return;                                  // sin sesión, no persistir

            clearTimeout(_debounceTimer);
            _debounceTimer = setTimeout(() => {
                const ref = cartRef(uid);
                if (!ref) return;
                ref.set({
                    items,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }).catch(err => console.warn('[CartSync] Error al guardar:', err.message));
            }, 800);
        },

        /**
         * Llamado en onAuthStateChanged cuando el usuario inicia sesión.
         * 1. Lee el carrito de Firestore.
         * 2. Mergea con el carrito local (si hay items sin guardar).
         * 3. Escribe el resultado mergeado de vuelta en Firestore y en localStorage.
         * 4. Dispara cartUpdated para que main.js actualice la UI.
         */
        async loadAndMerge(uid) {
            const ref = cartRef(uid);
            if (!ref) return;

            _syncing = true;
            try {
                const snap          = await ref.get();
                const firestoreItems = snap.exists ? (snap.data().items || []) : [];
                const localItems     = getLocal();

                // Si ambos están vacíos no hay nada que hacer
                if (firestoreItems.length === 0 && localItems.length === 0) return;

                const merged = merge(firestoreItems, localItems);
                setLocal(merged);
                window.dispatchEvent(new CustomEvent('cartUpdated'));

                // Persistir el resultado del merge
                await ref.set({
                    items: merged,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } catch (err) {
                console.warn('[CartSync] Error al cargar carrito:', err.message);
            } finally {
                _syncing = false;
            }
        },

        /**
         * Llamado en pagos.js justo antes de redirigir a Mercado Pago.
         * Limpia el carrito en Firestore (la compra se acaba de iniciar).
         */
        async clearFirestore(uid) {
            const ref = cartRef(uid);
            if (!ref) return;
            try {
                await ref.set({
                    items: [],
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } catch (err) {
                console.warn('[CartSync] Error al limpiar Firestore:', err.message);
            }
        },

        /**
         * Llamado en onAuthStateChanged cuando el usuario cierra sesión.
         * Limpia el carrito local y notifica a main.js vía cartUpdated.
         */
        clearLocal() {
            clearTimeout(_debounceTimer);
            setLocal([]);
            window.dispatchEvent(new CustomEvent('cartUpdated'));
        }
    };

    window.VoltCartSync = VoltCartSync;
})();
