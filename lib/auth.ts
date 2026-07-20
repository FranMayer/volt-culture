/**
 * lib/auth.ts — transcripción de legacy/js/store-auth.js (handlers) +
 * legacy/js/firebase-google-auth.js, sobre el SDK modular (firebase/auth)
 * en vez de compat. Funciones puras/async sin estado de React; el estado de
 * sesión vive en components/auth/AuthProvider.tsx (onAuthStateChanged) y el
 * modal de UI en components/auth/AuthModal.tsx.
 */
"use client";

import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    signInWithPopup,
    GoogleAuthProvider,
    getAdditionalUserInfo,
    sendPasswordResetEmail,
    signOut,
    type User,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";

// ── Mensajes de error — transcripción literal de store-auth.js ────────────

/** legacy store-auth.js:237-246 `_handleLogin` catch. */
export const LOGIN_ERROR_MESSAGES: Record<string, string> = {
    "auth/user-not-found": "No existe una cuenta con ese email.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/invalid-email": "Email inválido.",
    "auth/too-many-requests": "Demasiados intentos. Esperá unos minutos.",
    "auth/invalid-credential": "Email o contraseña incorrectos.",
    "auth/unauthorized-domain": "Dominio no autorizado en Firebase. Contactá soporte.",
    "auth/operation-not-allowed": "Ingreso con email no habilitado en Firebase Console.",
};

/** legacy store-auth.js:288-295 `_handleRegister` catch. */
export const REGISTER_ERROR_MESSAGES: Record<string, string> = {
    "auth/email-already-in-use": "Ya existe una cuenta con ese email. Ingresá en la otra pestaña.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/invalid-email": "Email inválido.",
    "auth/unauthorized-domain": "Dominio no autorizado en Firebase. Contactá soporte.",
    "auth/operation-not-allowed": "Registro con email no habilitado en Firebase Console.",
};

/** legacy store-auth.js:548-552 `forgotPasswordBtn` handler catch. */
export const RESET_ERROR_MESSAGES: Record<string, string> = {
    "auth/user-not-found": "No existe una cuenta con ese email.",
    "auth/invalid-email": "El email ingresado no es válido.",
};

/** legacy store-auth.js:349-360 `_googleSignInErrorMessage` (null = no mostrar error, ej. popup cerrado por el usuario). */
export function googleSignInErrorMessage(err: { code?: string; message?: string }): string | null {
    const msgs: Record<string, string | null> = {
        "auth/popup-closed-by-user": null,
        "auth/cancelled-popup-request": null,
        "auth/popup-blocked": "El navegador bloqueó la ventana de Google. Permití ventanas emergentes e intentá de nuevo.",
        "auth/account-exists-with-different-credential": "Ya existe una cuenta con ese email usando otro método de ingreso.",
        "auth/network-request-failed": "Error de red. Verificá tu conexión.",
        "auth/operation-not-allowed": "Google Sign-In no está habilitado en el proyecto.",
    };
    const code = err.code || "";
    if (code in msgs) return msgs[code];
    return err.message || "Error al conectar con Google. Intentá de nuevo.";
}

/** legacy store-auth.js:620-624 `_userName`: displayName si existe, si no la parte del email antes de @. */
export function displayName(user: Pick<User, "displayName" | "email">): string {
    const trimmed = (user.displayName || "").trim();
    if (trimmed) return trimmed;
    return (user.email || "").split("@")[0] || "";
}

// ── Firestore profile + welcome email ──────────────────────────────────────

async function createUserProfile(user: User, displayNameField: string): Promise<void> {
    // legacy store-auth.js:260-270 (email) / 319-329 (Google) — perfil en /users/{uid}
    await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email || "",
        displayName: displayNameField,
        createdAt: serverTimestamp(),
        lastAddress: null,
    });
}

function sendWelcomeEmail(user: User, name: string): void {
    // legacy store-auth.js:271-281 / 330-342 — fire-and-forget, error ignorado
    user.getIdToken()
        .then((idToken) =>
            fetch("/api/welcome-email", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ email: user.email || "", name }),
            })
        )
        .catch(() => {});
}

// ── API pública ─────────────────────────────────────────────────────────

export async function signInEmail(email: string, password: string): Promise<void> {
    // legacy store-auth.js:231 — onAuthStateChanged cierra el modal (ver AuthProvider)
    await signInWithEmailAndPassword(auth, email, password);
}

export async function registerEmail(name: string, email: string, password: string): Promise<void> {
    const cred = await createUserWithEmailAndPassword(auth, email, password); // legacy:255
    await updateProfile(cred.user, { displayName: name }); // legacy:258
    await createUserProfile(cred.user, name); // legacy:261-270 (displayName: name)
    sendWelcomeEmail(cred.user, displayName(cred.user)); // legacy:272-281 (name: this._userName(cred.user))
}

export async function signInGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider); // legacy firebase-google-auth.js:22 / store-auth.js:385-386
    const isNew = getAdditionalUserInfo(result)?.isNewUser === true; // legacy:316
    if (!isNew) return; // legacy:317
    await createUserProfile(result.user, result.user.displayName || ""); // legacy:322-328 (displayName: user.displayName || '')
    sendWelcomeEmail(result.user, displayName(result.user)); // legacy:339 (name: this._userName(user))
}

export async function signOutUser(): Promise<void> {
    await signOut(auth); // legacy store-auth.js:125
}

export async function sendPasswordReset(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email); // legacy store-auth.js:544
}

/** legacy store-auth.js:146-154 admin claim check (ahora expuesto para AuthProvider). */
export async function checkAdminClaim(user: User): Promise<boolean> {
    try {
        const tok = await user.getIdTokenResult();
        return tok.claims.admin === true;
    } catch {
        return false;
    }
}
