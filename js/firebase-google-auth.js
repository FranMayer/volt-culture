/**
 * Google Sign-In vía redirect — evita fallos por Cross-Origin-Opener-Policy con popup.
 */
(function () {
    'use strict';

    const PENDING_KEY = 'voltGoogleRedirectPending';

    window.VoltGoogleAuth = {
        markRedirectPending() {
            try { sessionStorage.setItem(PENDING_KEY, '1'); } catch (_) { /* ignore */ }
        },

        isRedirectPending() {
            try { return sessionStorage.getItem(PENDING_KEY) === '1'; } catch (_) { return false; }
        },

        clearRedirectPending() {
            try { sessionStorage.removeItem(PENDING_KEY); } catch (_) { /* ignore */ }
        },

        async signInWithGoogle() {
            const provider = new firebase.auth.GoogleAuthProvider();
            this.markRedirectPending();
            await firebase.auth().signInWithRedirect(provider);
        },

        /**
         * Llamar al cargar la página tras un redirect de Google.
         * Siempre consume getRedirectResult una vez (recomendación Firebase).
         */
        async completeRedirectIfNeeded() {
            const pending = this.isRedirectPending();
            this.clearRedirectPending();
            if (!pending) return null;
            return firebase.auth().getRedirectResult();
        }
    };
})();
