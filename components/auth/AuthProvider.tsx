"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { checkAdminClaim } from "@/lib/auth";
import { loadAndMerge, startCartSync } from "@/lib/cart/sync";

type AuthTab = "login" | "register";

interface AuthContextValue {
    user: User | null;
    loading: boolean;
    isAdmin: boolean;
    isModalOpen: boolean;
    activeTab: AuthTab;
    openModal: (tab?: AuthTab) => void;
    closeModal: () => void;
    switchTab: (tab: AuthTab) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// legacy store-auth.js:59 — guard sessionStorage: mergear una sola vez por
// sesión de navegador (por tab, sessionStorage no se comparte entre tabs).
const MERGE_KEY_PREFIX = "volt_cart_merged_";

/**
 * Orquesta legacy/js/store-auth.js#init() (onAuthStateChanged) +
 * legacy/js/cart-sync.js (subscribe del carrito). Se monta una única vez en
 * app/layout.tsx envolviendo toda la app, así Navbar/AuthModal comparten el
 * mismo listener de auth en vez de cada uno abrir el suyo.
 *
 * Idempotencia bajo StrictMode: el efecto de abajo hace setup→cleanup→setup
 * en dev. `startCartSync()`/`onAuthStateChanged()` devuelven su propio
 * unsubscribe y no acumulan estado global salvo el guard de sessionStorage
 * (que es intencionalmente persistente entre remounts — así un doble-mount
 * de StrictMode no dispara loadAndMerge dos veces para el mismo uid).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<AuthTab>("login");
    const wasLoggedOut = useRef(true);

    useEffect(() => {
        const unsubscribeCart = startCartSync();

        const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
            setUser(nextUser);
            setLoading(false);

            if (nextUser) {
                // legacy store-auth.js:56-63
                const mergeKey = `${MERGE_KEY_PREFIX}${nextUser.uid}`;
                if (!sessionStorage.getItem(mergeKey)) {
                    sessionStorage.setItem(mergeKey, "1");
                    loadAndMerge(nextUser.uid);
                }

                checkAdminClaim(nextUser).then(setIsAdmin); // legacy:146-154

                // legacy:65-76 — cierra el modal al loguearse si estaba abierto
                if (wasLoggedOut.current) {
                    setIsModalOpen(false);
                }
                wasLoggedOut.current = false;
            } else {
                // legacy store-auth.js:78-84 limpia los guards de merge Y el
                // carrito local. Acá se conserva el carrito local a propósito
                // (deviación pedida por la tarea F3b) — solo se limpian los
                // guards, así un login posterior vuelve a mergear.
                try {
                    Object.keys(sessionStorage)
                        .filter((k) => k.startsWith(MERGE_KEY_PREFIX))
                        .forEach((k) => sessionStorage.removeItem(k));
                } catch {
                    /* ignore */
                }
                setIsAdmin(false);
                wasLoggedOut.current = true;
            }
        });

        return () => {
            unsubscribeCart();
            unsubscribeAuth();
        };
    }, []);

    const openModal = useCallback((tab: AuthTab = "login") => {
        setActiveTab(tab);
        setIsModalOpen(true);
    }, []);
    const closeModal = useCallback(() => setIsModalOpen(false), []);
    const switchTab = useCallback((tab: AuthTab) => setActiveTab(tab), []);

    const value = useMemo(
        () => ({ user, loading, isAdmin, isModalOpen, activeTab, openModal, closeModal, switchTab }),
        [user, loading, isAdmin, isModalOpen, activeTab, openModal, closeModal, switchTab]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
    return ctx;
}
