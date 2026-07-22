/**
 * lib/firebase/client.ts — Firebase SDK modular (firebase@12.8) para el navegador.
 * Reemplaza el compat CDN de legacy/js/firebase-config.js.
 */
import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Config pública de Firebase client — única excepción tolerada a "no hardcodear"
// (CLAUDE.md): es pública por diseño (queda embebida en el bundle del browser).
// Mismos valores que legacy/js/firebase-config.js, ahora con NEXT_PUBLIC_* como
// fuente de verdad y esos valores como default si no se setean.
const firebaseConfig: FirebaseOptions = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBGDm4oqPL2ydPYpCNCxD5xyjDJ434IWts',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'volt-store-65157.firebaseapp.com',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'volt-store-65157',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'volt-store-65157.firebasestorage.app',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '1065544282572',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:1065544282572:web:5a0a876e06873e2fac6d69',
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-V8T1VZYLVB'
};

export const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
