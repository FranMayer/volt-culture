/**
 * VOLT Admin — Autenticación del panel (popup, sin redirect).
 * Evita bucles por signInWithRedirect + flags de sessionStorage de la tienda.
 */
(function () {
    'use strict';

    const ADMIN_EMAIL = 'volt.streetcba@gmail.com';
    const STORE_REDIRECT_KEYS = ['voltGoogleRedirectPending', 'voltGoogleRedirectPanel'];

    let auth = null;
    let panelInitialized = false;

    function clearStoreRedirectFlags() {
        STORE_REDIRECT_KEYS.forEach((key) => {
            try { sessionStorage.removeItem(key); } catch (_) { /* ignore */ }
        });
    }

    function showAdminLogin(message) {
        document.getElementById('adminLoader').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'flex';
        const errorEl = document.getElementById('adminLoginError');
        if (message) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        } else {
            errorEl.style.display = 'none';
        }
    }

    function showAdminPanel() {
        document.getElementById('adminLoader').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('adminLoginError').style.display = 'none';
        const panel = document.getElementById('adminPanel');
        if (!panel.classList.contains('authenticated')) {
            panel.classList.add('authenticated');
            if (typeof window.initAdminPanel === 'function' && !panelInitialized) {
                panelInitialized = true;
                window.initAdminPanel();
            }
        }
    }

    function resetGoogleBtn() {
        const btn = document.getElementById('adminGoogleBtn');
        if (!btn) return;
        if (!btn.dataset.defaultHtml) btn.dataset.defaultHtml = btn.innerHTML;
        btn.disabled = false;
        btn.innerHTML = btn.dataset.defaultHtml;
    }

    async function ensureAdminAccess(user) {
        const email = (user.email || '').toLowerCase();
        if (email !== ADMIN_EMAIL) {
            await auth.signOut();
            showAdminLogin('Solo ' + ADMIN_EMAIL + ' puede acceder. Cerrá sesión de otras cuentas de Google e intentá de nuevo.');
            return false;
        }

        let token;
        try {
            token = await user.getIdTokenResult(true);
        } catch (err) {
            console.warn('No se pudo refrescar el token admin:', err);
            token = await user.getIdTokenResult();
        }

        if (!token.claims.admin) {
            showAdminLogin(
                'Sin permisos de administrador en Firestore. ' +
                'Ejecutá: node scripts/set-admin.mjs ' + ADMIN_EMAIL +
                ' — cerrá sesión en la tienda, volvé a ingresar acá y probá de nuevo.'
            );
            return false;
        }

        return true;
    }

    async function handleAuthState(user) {
        try {
            if (!user) {
                showAdminLogin();
                resetGoogleBtn();
                return;
            }

            const allowed = await ensureAdminAccess(user);
            if (!allowed) {
                resetGoogleBtn();
                return;
            }

            showAdminPanel();
            resetGoogleBtn();
        } catch (err) {
            console.error('Admin auth:', err);
            showAdminLogin(err.message || 'Error de autenticación.');
            resetGoogleBtn();
        }
    }

    async function consumeStaleRedirect() {
        try {
            await auth.getRedirectResult();
        } catch (err) {
            if (err.code && err.code !== 'auth/no-auth-event') {
                console.warn('Redirect previo consumido:', err.code, err.message);
            }
        }
    }

    async function signInWithGooglePopup() {
        const btn = document.getElementById('adminGoogleBtn');
        const errorEl = document.getElementById('adminLoginError');
        if (!btn.dataset.defaultHtml) btn.dataset.defaultHtml = btn.innerHTML;

        errorEl.style.display = 'none';
        btn.disabled = true;
        btn.textContent = 'Conectando...';

        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            await auth.signInWithPopup(provider);
        } catch (err) {
            resetGoogleBtn();
            if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
                return;
            }
            const msgs = {
                'auth/popup-blocked': 'El navegador bloqueó la ventana. Permití popups para este sitio.',
                'auth/network-request-failed': 'Error de red. Verificá tu conexión.',
                'auth/unauthorized-domain': 'Dominio no autorizado en Firebase. Agregalo en Authentication → Settings → Authorized domains.',
            };
            errorEl.textContent = msgs[err.code] || err.message || 'No se pudo conectar con Google.';
            errorEl.style.display = 'block';
        }
    }

    async function init() {
        if (window.FirebaseConfig) window.FirebaseConfig.init();
        auth = firebase.auth();

        const btn = document.getElementById('adminGoogleBtn');
        if (btn) btn.dataset.defaultHtml = btn.innerHTML;

        clearStoreRedirectFlags();
        await consumeStaleRedirect();

        auth.onAuthStateChanged((user) => {
            handleAuthState(user);
        });

        document.getElementById('adminGoogleBtn').addEventListener('click', signInWithGooglePopup);

        document.getElementById('logoutBtn')?.addEventListener('click', async () => {
            await auth.signOut();
            window.location.href = '/pages/catalogo.html';
        });
    }

    window.VoltAdminAuth = { init, ADMIN_EMAIL };
})();
