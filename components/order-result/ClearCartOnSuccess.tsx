"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { clearFirestore, clearLocal } from "@/lib/cart/sync";

/**
 * Sin markup — efecto puro, transcripción de legacy/pages/success.html:146-158.
 * El pago ya se confirmó: el carrito local se vacía de inmediato (no depende
 * de auth, igual que el legacy `localStorage.removeItem("cart")` corriendo
 * sync apenas carga la página). Si además hay sesión, se limpia también el
 * documento de Firestore — si solo limpiáramos el local, `loadAndMerge` lo
 * repoblaría con los items recién comprados en el próximo login (mismo
 * comentario que deja el legacy).
 *
 * Se espera a que `loading` resuelva (en vez de leer `auth.currentUser`
 * sincrónicamente) porque el usuario acaba de volver de un dominio externo
 * (Mercado Pago) — el SDK de Firebase todavía puede no haber restaurado la
 * sesión persistida en el primer render. Mismo motivo por el que el legacy
 * usa `firebase.auth().onAuthStateChanged(...)` acá en vez de leer
 * `currentUser` directo. Guard explícito de uid (ver Tarea 1,
 * components/checkout/CheckoutModal.tsx): sin sesión no se toca Firestore.
 */
export default function ClearCartOnSuccess() {
    const { user, loading } = useAuth();

    useEffect(() => {
        clearLocal();
    }, []);

    useEffect(() => {
        if (!loading && user) {
            clearFirestore(user.uid);
        }
    }, [loading, user]);

    return null;
}
