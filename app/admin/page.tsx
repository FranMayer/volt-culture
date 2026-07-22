"use client";

import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { checkAdminClaim, signInGoogle, googleSignInErrorMessage } from "@/lib/auth";
import AdminShell from "@/components/admin/AdminShell";
import "@/app/styles/admin.css";

/**
 * app/admin/page.tsx — port de legacy/admin/panel.html + admin-auth.js.
 *
 * Gate por claim admin (trust boundary — el backend vuelve a verificar el
 * claim en cada endpoint que llama el panel: pages/api/admin-upload.js y
 * app/api/revalidate/route.ts vía lib/server/verify-admin.ts, así que este
 * gate del cliente es UX, no la barrera de seguridad real).
 *
 * Deliberadamente NO usa el `isAdmin` de useAuth() (components/auth/
 * AuthProvider.tsx) para la decisión de bloquear/mostrar: ese flag arranca en
 * `false` y solo se corrige de forma asíncrona después de que `user` ya está
 * seteado (ver AuthProvider — mismo checkAdminClaim(), pero corre en un
 * effect separado, después del render que ya vio `loading:false`). Usarlo acá
 * causaría un flash real de "acceso denegado" para un admin legítimo en cada
 * carga de /admin mientras esa verificación está en vuelo. Este componente
 * hace su propia llamada a checkAdminClaim() y expone un estado explícito
 * "checking" para ese instante, en vez de colapsarlo con "denied" — mismo
 * criterio de seguridad (mismo checkAdminClaim, mismo token, mismo backend),
 * mejor UX. isAdmin de useAuth() sigue siendo la fuente para el link "Panel"
 * del Navbar (components/layout/Navbar.tsx), que no es un trust boundary.
 */

type ClaimState = "idle" | "checking" | "admin" | "denied";

export default function AdminPage() {
    const { user, loading: authLoading } = useAuth();
    const [claimState, setClaimState] = useState<ClaimState>("idle");
    const [loginError, setLoginError] = useState<string | null>(null);
    const [googleBusy, setGoogleBusy] = useState(false);

    useEffect(() => {
        if (!user) {
            setClaimState("idle");
            return;
        }
        let cancelled = false;
        setClaimState("checking");
        checkAdminClaim(user).then((ok) => {
            if (cancelled) return;
            if (!ok) {
                // legacy admin-auth.js ensureAdminAccess(): una cuenta sin
                // claim admin se desloguea del panel automáticamente.
                signOut(auth).catch(() => {});
                setLoginError(
                    "Esta cuenta no tiene permisos de administrador (claim admin). " +
                        "Si recién asignaste el rol, volvé a ingresar con Google."
                );
            }
            setClaimState(ok ? "admin" : "denied");
        });
        return () => {
            cancelled = true;
        };
    }, [user]);

    async function handleGoogleSignIn() {
        setLoginError(null);
        setGoogleBusy(true);
        try {
            await signInGoogle();
        } catch (err) {
            const msg = googleSignInErrorMessage(err as { code?: string; message?: string });
            if (msg) setLoginError(msg);
        } finally {
            setGoogleBusy(false);
        }
    }

    function handleLogout() {
        signOut(auth).finally(() => {
            window.location.href = "/catalogo";
        });
    }

    // ── Estado 1: auth resolviéndose o claim en verificación ──────────────
    if (authLoading || claimState === "checking") {
        return (
            <div className="admin-page">
                <div className="admin-loader">
                    <div className="admin-loader__spinner" />
                </div>
            </div>
        );
    }

    // ── Estado 2/3: sin sesión, o con sesión pero sin claim admin ─────────
    // (bloqueado en ambos casos — nunca se monta AdminShell).
    if (!user || claimState === "denied") {
        return (
            <div className="admin-page">
                <div className="login-screen">
                    <div className="login-box">
                        <img
                            className="login-logo"
                            src="/images-brand/Logo color y blanco.svg"
                            width={800}
                            height={800}
                            alt="VOLT — Motorsport Culture"
                        />
                        <div className="login-subtitle">Panel de Administración</div>
                        {loginError && <div className="login-error">{loginError}</div>}
                        <button
                            type="button"
                            className="login-btn"
                            onClick={handleGoogleSignIn}
                            disabled={googleBusy}
                        >
                            <svg width={20} height={20} viewBox="0 0 48 48" aria-hidden="true">
                                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.98 37.03 48 31.45 48 24.55z" />
                                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                            </svg>
                            {googleBusy ? "Conectando..." : "Ingresar con Google"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Estado 4: sesión + claim admin verificado — panel real ─────────────
    return (
        <div className="admin-page">
            <AdminShell onLogout={handleLogout} />
        </div>
    );
}
