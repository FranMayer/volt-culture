"use client";

import { useEffect, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useAuth } from "./AuthProvider";
import {
    signInEmail,
    registerEmail,
    signInGoogle,
    sendPasswordReset,
    googleSignInErrorMessage,
    LOGIN_ERROR_MESSAGES,
    REGISTER_ERROR_MESSAGES,
    RESET_ERROR_MESSAGES,
} from "@/lib/auth";

interface AuthError {
    code?: string;
    message?: string;
}

// Ported from legacy/js/store-auth.js `_buildModal()` — markup/ids/classes
// preserved verbatim so app/styles/style.css (#voltAuthModal ...) applies
// as-is. Bootstrap's modal JS (show/hide/backdrop/scroll-lock) is gone
// (CLAUDE.md "Bootstrap eliminado"); this component re-implements it the
// same way components/layout/CartOffcanvas.tsx does for the offcanvas —
// see app/styles/modal.css for the accompanying .modal/.modal-backdrop CSS.
export default function AuthModal() {
    const { isModalOpen, activeTab, closeModal, switchTab } = useAuth();

    const [loginEmail, setLoginEmail] = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    const [loginError, setLoginError] = useState("");
    const [loginSubmitting, setLoginSubmitting] = useState(false);
    const [showLoginPw, setShowLoginPw] = useState(false);
    const [capsLoginOn, setCapsLoginOn] = useState(false);
    const [resetSuccess, setResetSuccess] = useState("");

    const [registerName, setRegisterName] = useState("");
    const [registerEmailValue, setRegisterEmailValue] = useState("");
    const [registerPassword, setRegisterPassword] = useState("");
    const [registerError, setRegisterError] = useState("");
    const [registerSubmitting, setRegisterSubmitting] = useState(false);
    const [showRegisterPw, setShowRegisterPw] = useState(false);
    const [capsRegisterOn, setCapsRegisterOn] = useState(false);

    const [googleBusy, setGoogleBusy] = useState<AuthTabId | null>(null);

    // legacy store-auth.js:177-185 `_switchTab` clears errors on tab change.
    useEffect(() => {
        setLoginError("");
        setRegisterError("");
        setResetSuccess("");
    }, [activeTab]);

    // legacy store-auth.js:48-51 `hidden.bs.modal` -> _resetAuthModalFormState + _clearErrors.
    useEffect(() => {
        if (isModalOpen) return;
        setLoginSubmitting(false);
        setRegisterSubmitting(false);
        setGoogleBusy(null);
        setLoginError("");
        setRegisterError("");
        setResetSuccess("");
    }, [isModalOpen]);

    // Scroll-lock, same approach as CartOffcanvas.
    useEffect(() => {
        if (!isModalOpen) return;
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        const previousOverflow = document.body.style.overflow;
        const previousPaddingRight = document.body.style.paddingRight;
        document.body.style.overflow = "hidden";
        if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
        return () => {
            document.body.style.overflow = previousOverflow;
            document.body.style.paddingRight = previousPaddingRight;
        };
    }, [isModalOpen]);

    useEffect(() => {
        if (!isModalOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeModal();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [isModalOpen, closeModal]);

    async function handleLoginSubmit(e: FormEvent) {
        e.preventDefault();
        if (!loginEmail || !loginPassword) return; // legacy:563
        setLoginSubmitting(true);
        try {
            await signInEmail(loginEmail, loginPassword); // AuthProvider cierra el modal al detectar sesión
        } catch (err) {
            setLoginSubmitting(false);
            const code = (err as AuthError)?.code || "";
            setLoginError(LOGIN_ERROR_MESSAGES[code] || "Error al ingresar.");
        }
    }

    async function handleRegisterSubmit(e: FormEvent) {
        e.preventDefault();
        if (!registerName || !registerEmailValue || !registerPassword) return; // legacy:574
        setRegisterSubmitting(true);
        try {
            await registerEmail(registerName, registerEmailValue, registerPassword);
        } catch (err) {
            setRegisterSubmitting(false);
            const code = (err as AuthError)?.code || "";
            setRegisterError(REGISTER_ERROR_MESSAGES[code] || "Error al crear la cuenta.");
        }
    }

    async function handleGoogleSignIn(panel: AuthTabId) {
        setGoogleBusy(panel);
        if (panel === "login") setLoginError("");
        else setRegisterError("");
        try {
            await signInGoogle();
        } catch (err) {
            const msg = googleSignInErrorMessage(err as AuthError);
            if (msg) {
                if (panel === "login") setLoginError(msg);
                else setRegisterError(msg);
            }
        } finally {
            setGoogleBusy(null);
        }
    }

    async function handleForgotPassword() {
        setLoginError("");
        setResetSuccess("");
        const email = loginEmail.trim();
        if (!email) {
            setLoginError("Escribí tu email arriba y luego hacé clic en este link.");
            document.getElementById("loginEmail")?.focus();
            return;
        }
        try {
            await sendPasswordReset(email);
            setResetSuccess("Te enviamos un email para restablecer tu contraseña. Revisá tu bandeja de entrada.");
        } catch (err) {
            const code = (err as AuthError)?.code || "";
            setLoginError(RESET_ERROR_MESSAGES[code] || "No pudimos enviar el email. Intentá de nuevo.");
        }
    }

    const capsHandlers = (setCaps: (v: boolean) => void) => ({
        onKeyUp: (e: ReactKeyboardEvent) => setCaps(e.getModifierState?.("CapsLock") ?? false),
        onKeyDown: (e: ReactKeyboardEvent) => setCaps(e.getModifierState?.("CapsLock") ?? false),
        onBlur: () => setCaps(false),
    });

    return (
        <>
            {isModalOpen && <div className="modal-backdrop show" onClick={closeModal} aria-hidden="true" />}

            <div
                className={`modal fade${isModalOpen ? " show" : ""}`}
                id="voltAuthModal"
                tabIndex={-1}
                aria-hidden={!isModalOpen}
            >
                <div className="modal-dialog modal-dialog-centered">
                    <div className="modal-content auth-modal-content">
                        <div className="auth-modal-header">
                            <div className="auth-brand">
                                <span className="auth-brand-mark" aria-hidden="true">V</span>
                                <span className="auth-brand-word">VOLT</span>
                            </div>
                            <button
                                type="button"
                                className="btn-close btn-close-white"
                                aria-label="Cerrar"
                                onClick={closeModal}
                            />
                        </div>

                        <div className="auth-modal-body">
                            <div className="auth-tabs">
                                <button
                                    type="button"
                                    className={`auth-tab-btn${activeTab === "login" ? " active" : ""}`}
                                    data-tab="login"
                                    onClick={() => switchTab("login")}
                                >
                                    Ingresar
                                </button>
                                <button
                                    type="button"
                                    className={`auth-tab-btn${activeTab === "register" ? " active" : ""}`}
                                    data-tab="register"
                                    onClick={() => switchTab("register")}
                                >
                                    Crear cuenta
                                </button>
                            </div>

                            {/* PANEL: LOGIN */}
                            <div className="auth-tab-panel" id="auth-panel-login" style={{ display: activeTab === "login" ? "block" : "none" }}>
                                <h2 className="auth-modal-title">Bienvenido de nuevo</h2>
                                <p className="auth-modal-subtitle">Ingresá para continuar con tu compra</p>
                                <div className="auth-modal-error" role="alert" aria-live="assertive" style={{ display: loginError ? "block" : "none" }}>
                                    {loginError}
                                </div>
                                <button
                                    type="button"
                                    id="googleLoginBtn"
                                    className="auth-google-btn"
                                    aria-label="Continuar con Google"
                                    disabled={googleBusy !== null}
                                    onClick={() => handleGoogleSignIn("login")}
                                >
                                    {googleBusy === "login" ? (
                                        <span>Conectando...</span>
                                    ) : (
                                        <GoogleButtonInner />
                                    )}
                                </button>
                                <p className="auth-divider-o" aria-hidden="true">o con tu email</p>
                                <form id="voltLoginForm" noValidate onSubmit={handleLoginSubmit}>
                                    <div className="auth-field">
                                        <label className="auth-label" htmlFor="loginEmail">Email</label>
                                        <input
                                            type="email"
                                            id="loginEmail"
                                            className="auth-input"
                                            placeholder="tu@email.com"
                                            autoComplete="email"
                                            inputMode="email"
                                            required
                                            value={loginEmail}
                                            onChange={(e) => setLoginEmail(e.target.value)}
                                        />
                                    </div>
                                    <div className="auth-field">
                                        <div className="auth-label-row">
                                            <label className="auth-label" htmlFor="loginPassword">Contraseña</label>
                                            <button type="button" id="forgotPasswordBtn" className="auth-forgot-link" onClick={handleForgotPassword}>
                                                ¿Olvidaste tu contraseña?
                                            </button>
                                        </div>
                                        <div className="auth-input-wrap">
                                            <input
                                                type={showLoginPw ? "text" : "password"}
                                                id="loginPassword"
                                                className="auth-input auth-input--pw"
                                                placeholder="Tu contraseña"
                                                autoComplete="current-password"
                                                aria-describedby="loginCapsHint"
                                                required
                                                value={loginPassword}
                                                onChange={(e) => setLoginPassword(e.target.value)}
                                                {...capsHandlers(setCapsLoginOn)}
                                            />
                                            <button
                                                type="button"
                                                className={`auth-pw-toggle${showLoginPw ? " is-visible" : ""}`}
                                                data-target="loginPassword"
                                                aria-label={showLoginPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                                                aria-pressed={showLoginPw}
                                                onClick={() => setShowLoginPw((v) => !v)}
                                            >
                                                <EyeIcon />
                                            </button>
                                        </div>
                                        <p className="auth-caps-hint" id="loginCapsHint" style={{ display: capsLoginOn ? "flex" : "none" }}>
                                            <CapsIcon />
                                            <span>Bloq Mayús activado</span>
                                        </p>
                                    </div>
                                    <div className="auth-modal-success" id="resetSuccessMsg" style={{ display: resetSuccess ? "block" : "none" }}>
                                        {resetSuccess}
                                    </div>
                                    <button type="submit" id="loginSubmitBtn" className="auth-submit-btn" disabled={loginSubmitting}>
                                        {loginSubmitting ? "Ingresando..." : "Ingresar"}
                                    </button>
                                </form>
                                <div className="auth-trust">
                                    <ShieldIcon />
                                    <span>Pago y datos protegidos · Córdoba, AR</span>
                                </div>
                            </div>

                            {/* PANEL: REGISTRO */}
                            <div className="auth-tab-panel" id="auth-panel-register" style={{ display: activeTab === "register" ? "block" : "none" }}>
                                <h2 className="auth-modal-title">Creá tu cuenta VOLT</h2>
                                <p className="auth-modal-subtitle">Sumate para comprar más rápido y seguir tus pedidos</p>
                                <div className="auth-modal-error" role="alert" aria-live="assertive" style={{ display: registerError ? "block" : "none" }}>
                                    {registerError}
                                </div>
                                <button
                                    type="button"
                                    id="googleRegisterBtn"
                                    className="auth-google-btn"
                                    aria-label="Continuar con Google"
                                    disabled={googleBusy !== null}
                                    onClick={() => handleGoogleSignIn("register")}
                                >
                                    {googleBusy === "register" ? (
                                        <span>Conectando...</span>
                                    ) : (
                                        <GoogleButtonInner />
                                    )}
                                </button>
                                <p className="auth-divider-o" aria-hidden="true">o con tu email</p>
                                <form id="voltRegisterForm" noValidate onSubmit={handleRegisterSubmit}>
                                    <div className="auth-field">
                                        <label className="auth-label" htmlFor="registerName">Nombre completo</label>
                                        <input
                                            type="text"
                                            id="registerName"
                                            className="auth-input"
                                            placeholder="Juan Pérez"
                                            autoComplete="name"
                                            required
                                            value={registerName}
                                            onChange={(e) => setRegisterName(e.target.value)}
                                        />
                                    </div>
                                    <div className="auth-field">
                                        <label className="auth-label" htmlFor="registerEmail">Email</label>
                                        <input
                                            type="email"
                                            id="registerEmail"
                                            className="auth-input"
                                            placeholder="tu@email.com"
                                            autoComplete="email"
                                            inputMode="email"
                                            required
                                            value={registerEmailValue}
                                            onChange={(e) => setRegisterEmailValue(e.target.value)}
                                        />
                                    </div>
                                    <div className="auth-field">
                                        <label className="auth-label" htmlFor="registerPassword">Contraseña</label>
                                        <div className="auth-input-wrap">
                                            <input
                                                type={showRegisterPw ? "text" : "password"}
                                                id="registerPassword"
                                                className="auth-input auth-input--pw"
                                                placeholder="Mínimo 6 caracteres"
                                                autoComplete="new-password"
                                                aria-describedby="registerCapsHint"
                                                required
                                                value={registerPassword}
                                                onChange={(e) => setRegisterPassword(e.target.value)}
                                                {...capsHandlers(setCapsRegisterOn)}
                                            />
                                            <button
                                                type="button"
                                                className={`auth-pw-toggle${showRegisterPw ? " is-visible" : ""}`}
                                                data-target="registerPassword"
                                                aria-label={showRegisterPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                                                aria-pressed={showRegisterPw}
                                                onClick={() => setShowRegisterPw((v) => !v)}
                                            >
                                                <EyeIcon />
                                            </button>
                                        </div>
                                        <p className="auth-caps-hint" id="registerCapsHint" style={{ display: capsRegisterOn ? "flex" : "none" }}>
                                            <CapsIcon />
                                            <span>Bloq Mayús activado</span>
                                        </p>
                                    </div>
                                    <button type="submit" id="registerSubmitBtn" className="auth-submit-btn" disabled={registerSubmitting}>
                                        {registerSubmitting ? "Creando cuenta..." : "Crear cuenta"}
                                    </button>
                                </form>
                                <div className="auth-trust">
                                    <ShieldIcon />
                                    <span>Seguí tus pedidos y comprá más rápido</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

type AuthTabId = "login" | "register";

// legacy store-auth.js:302-312 `_googleBtnInnerHTML` (SVG oficial de 4 colores).
function GoogleButtonInner() {
    return (
        <>
            <svg className="auth-google-btn__icon" width={18} height={18} viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.98 37.03 48 31.45 48 24.55z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            <span>Continuar con Google</span>
        </>
    );
}

function EyeIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx={12} cy={12} r={3} />
        </svg>
    );
}

function CapsIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="m12 3 8 8h-5v6H9v-6H4l8-8Z" />
        </svg>
    );
}

function ShieldIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <rect x={4} y={10} width={16} height={11} rx={2} />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
    );
}
