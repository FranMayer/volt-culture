/**
 * lib/firebase/admin.ts — inicialización única de firebase-admin (server-only).
 * Reemplaza el `initAdmin()`/`initAdminAuth()` duplicado en ~7 archivos de api/*.js.
 *
 * IMPORTANTE: no importar desde componentes cliente ni desde código que Next
 * pueda bundlear para el browser — usa credenciales de service account.
 */
import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

function credentialFromEnv() {
    const projectId = (process.env.FIREBASE_PROJECT_ID || '').replace(/^"|"$/g, '').trim();
    const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').replace(/^"|"$/g, '').trim();
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '')
        .replace(/\\n/g, '\n')
        .replace(/^"|"$/g, '')
        .trim();
    return { projectId, clientEmail, privateKey };
}

/** Inicializa la app admin una única vez y devuelve la instancia. Idempotente. */
export function initAdmin(): App {
    const existing = getApps();
    if (existing.length) return existing[0]!;
    return initializeApp({ credential: cert(credentialFromEnv()) });
}

export function adminDb(): Firestore {
    initAdmin();
    return getFirestore();
}

export function adminAuth(): Auth {
    initAdmin();
    return getAuth();
}
