/**
 * Google Sign-In vía popup — compatible con deploy en Vercel (sin /__/firebase/init.json).
 * Incluye stubs de la API redirect (legacy) para store-auth.js cacheado en el navegador.
 */
(function () {
    'use strict';

    const PENDING_KEY = 'voltGoogleRedirectPending';
    const PANEL_KEY = 'voltGoogleRedirectPanel';

    function clearRedirectFlags() {
        try {
            sessionStorage.removeItem(PENDING_KEY);
            sessionStorage.removeItem(PANEL_KEY);
        } catch (_) { /* ignore */ }
    }

    window.VoltGoogleAuth = {
        signInWithGoogle() {
            clearRedirectFlags();
            const provider = new firebase.auth.GoogleAuthProvider();
            return firebase.auth().signInWithPopup(provider)
                .then((result) => result)
                .catch((error) => {
                    console.error('[VoltAuth] Google popup error:', error);
                    throw error;
                });
        },

        /** @deprecated Redirect flow — no-op (popup no usa flags). */
        markRedirectPending() {},

        /** @deprecated Redirect flow — siempre false con popup. */
        isRedirectPending() {
            return false;
        },

        /** Limpia flags de sesión del flujo redirect anterior. */
        clearRedirectPending() {
            clearRedirectFlags();
        },

        /**
         * @deprecated Compat con store-auth cacheado: consume redirect pendiente sin romper el modal.
         * @returns {Promise<firebase.auth.UserCredential|null>}
         */
        async completeRedirectIfNeeded() {
            clearRedirectFlags();
            try {
                const result = await firebase.auth().getRedirectResult();
                return result?.user ? result : null;
            } catch (err) {
                if (err?.code === 'auth/no-auth-event') return null;
                console.warn('[VoltAuth] getRedirectResult:', err?.code, err?.message);
                return null;
            }
        }
    };
})();
