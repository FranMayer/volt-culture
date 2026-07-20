/**
 * VOLT - Firebase Configuration
 * Configuración de Firebase para el catálogo de productos
 */

// =====================================================
// CONFIGURACIÓN DE FIREBASE - TUS CREDENCIALES
// =====================================================
const firebaseConfig = {
    apiKey: "AIzaSyBGDm4oqPL2ydPYpCNCxD5xyjDJ434IWts",
    authDomain: "volt-store-65157.firebaseapp.com",
    projectId: "volt-store-65157",
    storageBucket: "volt-store-65157.firebasestorage.app",
    messagingSenderId: "1065544282572",
    appId: "1:1065544282572:web:5a0a876e06873e2fac6d69",
    measurementId: "G-V8T1VZYLVB"
};

// =====================================================
// INICIALIZACIÓN DE FIREBASE
// =====================================================
let db = null;
let firebaseInitialized = false;

// Verificar si Firebase está configurado
function isFirebaseConfigured() {
    return firebaseConfig.apiKey !== "TU_API_KEY";
}

// Inicializar Firebase
function initializeFirebase() {
    if (!isFirebaseConfigured()) {
        console.warn('⚠️ Firebase no está configurado. Usando datos de ejemplo.');
        return false;
    }

    try {
        // Inicializar Firebase (usando la versión compat cargada via CDN)
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        // Tocar Auth para validar que el SDK cargó (misma app que Firestore)
        if (typeof firebase.auth === 'function') {
            firebase.auth();
        }
        firebaseInitialized = true;
        console.log('✅ Firebase inicializado correctamente');
        return true;
    } catch (error) {
        console.error('❌ Error al inicializar Firebase:', error);
        return false;
    }
}

// =====================================================
// EXPORTAR CONFIGURACIÓN
// =====================================================
window.FirebaseConfig = {
    init: initializeFirebase,
    isConfigured: isFirebaseConfigured,
    getDb: () => db,
    getAuth: () => (firebaseInitialized && typeof firebase.auth === 'function' ? firebase.auth() : null),
    isInitialized: () => firebaseInitialized
};
