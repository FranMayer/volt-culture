/**
 * Google Sign-In vía popup — compatible con deploy en Vercel (sin /__/firebase/init.json).
 */
(function () {
    'use strict';

    window.VoltGoogleAuth = {
        signInWithGoogle() {
            const provider = new firebase.auth.GoogleAuthProvider();
            return firebase.auth().signInWithPopup(provider)
                .then((result) => result)
                .catch((error) => {
                    console.error('[VoltAuth] Google popup error:', error);
                    throw error;
                });
        }
    };
})();
