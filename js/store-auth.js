/**
 * VOLT Store — Autenticación de clientes
 * Login / Registro con Firebase Auth + guardado en Firestore.
 * Expone window.VoltStoreAuth para ser usado desde pagos.js y el navbar.
 */

(function () {
    'use strict';

    const LOG = '[VoltStoreAuth]';
    const LEGACY_GOOGLE_REDIRECT_KEYS = ['voltGoogleRedirectPending', 'voltGoogleRedirectPanel'];

    const VoltStoreAuth = {
        _modalEl: null,
        _resolveAuth: null,
        _modalEventsBound: false,

        // ── Inicialización ───────────────────────────────────────────────

        _clearLegacyGoogleRedirectState() {
            window.VoltGoogleAuth?.clearRedirectPending?.();
            LEGACY_GOOGLE_REDIRECT_KEYS.forEach((key) => {
                try { sessionStorage.removeItem(key); } catch (_) { /* ignore */ }
            });
        },

        async init() {
            try {
                this._clearLegacyGoogleRedirectState();

                if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') {
                    console.error(LOG, 'Firebase Auth SDK no cargó. Revisá los <script> de gstatic firebase-*-compat.');
                    this._buildModal();
                    this._updateNavbar(null);
                    return;
                }

                if (window.FirebaseConfig) {
                    const ok = window.FirebaseConfig.init();
                    if (!ok) console.warn(LOG, 'FirebaseConfig.init() devolvió false');
                }

                this._buildModal();

                // Navbar visible de inmediato (no esperar onAuthStateChanged)
                this._updateNavbar(firebase.auth().currentUser);

                this._modalEl.addEventListener('hidden.bs.modal', () => {
                    this._resetAuthModalFormState();
                    this._clearErrors();
                });

                firebase.auth().onAuthStateChanged((user) => {
                    this._updateNavbar(user);

                    if (user) {
                        // Guard: solo mergear una vez por sesión de navegador para evitar
                        // que cada refresh sume cantidades al carrito.
                        const mergeKey = `volt_cart_merged_${user.uid}`;
                        if (!sessionStorage.getItem(mergeKey)) {
                            sessionStorage.setItem(mergeKey, '1');
                            window.VoltCartSync?.loadAndMerge(user.uid);
                        }

                        if (this._resolveAuth) {
                            const resolve = this._resolveAuth;
                            this._resolveAuth = null;
                            resolve(user);
                        }

                        const inst = typeof bootstrap !== 'undefined'
                            ? bootstrap.Modal.getInstance(this._modalEl)
                            : null;
                        if (inst && this._modalEl.classList.contains('show')) {
                            inst.hide();
                        }
                    } else {
                        // Limpiar el guard de merge al cerrar sesión
                        try {
                            Object.keys(sessionStorage)
                                .filter(k => k.startsWith('volt_cart_merged_'))
                                .forEach(k => sessionStorage.removeItem(k));
                        } catch (_) { /* ignore */ }
                        window.VoltCartSync?.clearLocal();
                    }
                });
            } catch (err) {
                console.error(LOG, 'Error en init:', err);
                this._buildModal();
                this._updateNavbar(null);
            }
        },

        // ── API pública ──────────────────────────────────────────────────

        /**
         * Devuelve una Promise<user|null>.
         * Si hay sesión activa resuelve inmediatamente.
         * Si no hay sesión, abre el modal y espera login/registro.
         * Si el usuario cierra el modal sin loguearse → resuelve null.
         */
        requireAuth() {
            const user = firebase.auth().currentUser;
            if (user) return Promise.resolve(user);

            return new Promise((resolve) => {
                this._resolveAuth = resolve;
                this._showModal();

                // Modal cerrado sin login
                this._modalEl.addEventListener('hidden.bs.modal', () => {
                    if (this._resolveAuth) {
                        this._resolveAuth = null;
                        resolve(null);
                    }
                }, { once: true });
            });
        },

        getCurrentUser() {
            return firebase.auth().currentUser;
        },

        async signOut() {
            await firebase.auth().signOut();
        },

        // ── Navbar ───────────────────────────────────────────────────────

        _updateNavbar(user) {
            const nav = document.getElementById('authNav');
            if (!nav) return;

            if (user) {
                const name = this._userName(user);
                nav.innerHTML = `
                    <span class="auth-greeting">Hola, <strong>${this._esc(name)}</strong></span>
                    <a href="/pages/mis-pedidos.html" class="auth-btn auth-btn--link">Mis pedidos</a>
                    <button class="auth-btn auth-btn--out" id="voltSignOutBtn">Salir</button>
                `;
                document.getElementById('voltSignOutBtn')
                    .addEventListener('click', () => this.signOut());

                nav.classList.add('loaded');

                user.getIdTokenResult().then(tok => {
                    if (tok.claims.admin) {
                        const link = document.createElement('a');
                        link.href = '/admin/panel.html';
                        link.className = 'auth-btn auth-btn--admin';
                        link.textContent = '⚡ Panel';
                        nav.prepend(link);
                    }
                }).catch((e) => console.warn(LOG, 'admin claim check:', e.message));
            } else {
                nav.innerHTML = `
                    <button class="auth-btn auth-btn--in" id="voltSignInBtn">Ingresar</button>
                `;
                document.getElementById('voltSignInBtn')
                    .addEventListener('click', () => this._showModal());
                nav.classList.add('loaded');
            }
        },

        // ── Modal ────────────────────────────────────────────────────────

        _showModal() {
            this._switchTab('login');
            this._clearErrors();
            if (typeof bootstrap === 'undefined') {
                console.error(LOG, 'Bootstrap no cargó; el modal de login no puede abrirse.');
                return;
            }
            bootstrap.Modal.getOrCreateInstance(this._modalEl).show();
        },

        _switchTab(tab) {
            this._modalEl.querySelectorAll('.auth-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === tab);
            });
            this._modalEl.querySelectorAll('.auth-tab-panel').forEach(panel => {
                panel.style.display = (panel.id === `auth-panel-${tab}`) ? 'block' : 'none';
            });
            this._clearErrors();
        },

        _clearErrors() {
            this._modalEl.querySelectorAll('.auth-modal-error, .auth-modal-success').forEach(el => {
                el.textContent = '';
                el.style.display = 'none';
            });
        },

        /** Restaura textos y botones del modal (evita "Ingresando..." / Google colgados). */
        _resetAuthModalFormState() {
            const loginBtn = document.getElementById('loginSubmitBtn');
            const regBtn = document.getElementById('registerSubmitBtn');
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Ingresar';
            }
            if (regBtn) {
                regBtn.disabled = false;
                regBtn.textContent = 'Crear cuenta';
            }
            const gl = document.getElementById('googleLoginBtn');
            const gr = document.getElementById('googleRegisterBtn');
            const inner = this._googleBtnInnerHTML();
            if (gl) {
                gl.disabled = false;
                gl.innerHTML = inner;
            }
            if (gr) {
                gr.disabled = false;
                gr.innerHTML = inner;
            }
        },

        _showError(panelId, msg) {
            const el = this._modalEl.querySelector(`#${panelId} .auth-modal-error`);
            if (el) { el.textContent = msg; el.style.display = 'block'; }
        },

        // ── Handlers de formularios ──────────────────────────────────────

        async _handleLogin(email, password, btn) {
            const original = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Ingresando...';
            try {
                await firebase.auth().signInWithEmailAndPassword(email, password);
                // onAuthStateChanged cierra el modal automáticamente
            } catch (err) {
                console.error(LOG, 'login:', err.code, err.message);
                btn.disabled = false;
                btn.textContent = original;
                const msgs = {
                    'auth/user-not-found':    'No existe una cuenta con ese email.',
                    'auth/wrong-password':    'Contraseña incorrecta.',
                    'auth/invalid-email':     'Email inválido.',
                    'auth/too-many-requests': 'Demasiados intentos. Esperá unos minutos.',
                    'auth/invalid-credential':'Email o contraseña incorrectos.',
                    'auth/unauthorized-domain': 'Dominio no autorizado en Firebase. Contactá soporte.',
                    'auth/operation-not-allowed': 'Ingreso con email no habilitado en Firebase Console.',
                };
                this._showError('auth-panel-login', msgs[err.code] || 'Error al ingresar.');
            }
        },

        async _handleRegister(name, email, password, btn) {
            const original = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Creando cuenta...';
            try {
                const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);

                // Guardar nombre en Firebase Auth
                await cred.user.updateProfile({ displayName: name });

                // Guardar perfil en Firestore /users/{uid}
                const db = window.FirebaseConfig?.getDb();
                if (db) {
                    await db.collection('users').doc(cred.user.uid).set({
                        uid:         cred.user.uid,
                        email,
                        displayName: name,
                        createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
                        lastAddress: null
                    });
                }
                // Email de bienvenida — fire-and-forget
                cred.user.getIdToken().then((idToken) =>
                    fetch('/api/welcome-email', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${idToken}`
                        },
                        body: JSON.stringify({ email, name: this._userName(cred.user) })
                    })
                ).catch(() => {});

                // onAuthStateChanged cierra el modal automáticamente
            } catch (err) {
                console.error(LOG, 'register:', err.code, err.message);
                btn.disabled = false;
                btn.textContent = original;
                const msgs = {
                    'auth/email-already-in-use': 'Ya existe una cuenta con ese email. Ingresá en la otra pestaña.',
                    'auth/weak-password':        'La contraseña debe tener al menos 6 caracteres.',
                    'auth/invalid-email':        'Email inválido.',
                    'auth/unauthorized-domain': 'Dominio no autorizado en Firebase. Contactá soporte.',
                    'auth/operation-not-allowed': 'Registro con email no habilitado en Firebase Console.',
                };
                this._showError('auth-panel-register', msgs[err.code] || 'Error al crear la cuenta.');
            }
        },

        // ── Google Sign-In ───────────────────────────────────────────────

        /** SVG inline logo Google (4 colores oficiales). */
        _googleBtnInnerHTML() {
            return `
                <svg class="auth-google-btn__icon" width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.98 37.03 48 31.45 48 24.55z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                <span>Continuar con Google</span>
            `;
        },

        async _processGoogleSignInResult(result) {
            const user = result.user;
            const isNew = result.additionalUserInfo?.isNewUser === true;
            if (!isNew) return;

            const db = window.FirebaseConfig?.getDb();
            try {
                if (db) {
                    await db.collection('users').doc(user.uid).set({
                        uid: user.uid,
                        email: user.email || '',
                        displayName: user.displayName || '',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        lastAddress: null
                    });
                }
                user.getIdToken().then((idToken) =>
                    fetch('/api/welcome-email', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${idToken}`
                        },
                        body: JSON.stringify({
                            email: user.email || '',
                            name: this._userName(user)
                        })
                    })
                ).catch(() => {});
            } catch (fsErr) {
                console.error(LOG, 'perfil Firestore (Google):', fsErr.code || fsErr.message, fsErr);
                throw fsErr;
            }
        },

        _googleSignInErrorMessage(err) {
            const msgs = {
                'auth/popup-closed-by-user': null,
                'auth/cancelled-popup-request': null,
                'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Permití ventanas emergentes e intentá de nuevo.',
                'auth/account-exists-with-different-credential': 'Ya existe una cuenta con ese email usando otro método de ingreso.',
                'auth/network-request-failed': 'Error de red. Verificá tu conexión.',
                'auth/operation-not-allowed': 'Google Sign-In no está habilitado en el proyecto.',
            };
            if (msgs[err.code] === null) return null;
            return msgs[err.code] || err.message || 'Error al conectar con Google. Intentá de nuevo.';
        },

        async _handleGoogleSignIn(panelId) {
            const btnId = panelId === 'auth-panel-login' ? 'googleLoginBtn' : 'googleRegisterBtn';
            const btn = document.getElementById(btnId);
            if (!btn) return;

            this._clearErrors();
            const originalHTML = btn.innerHTML;
            const restoreGoogleBtn = () => {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
            };

            btn.disabled = true;
            btn.innerHTML = '<span>Conectando...</span>';

            try {
                if (typeof window.VoltGoogleAuth?.signInWithGoogle === 'function') {
                    const result = await window.VoltGoogleAuth.signInWithGoogle();
                    await this._processGoogleSignInResult(result);
                    restoreGoogleBtn();
                    return;
                }

                const provider = new firebase.auth.GoogleAuthProvider();
                const result = await firebase.auth().signInWithPopup(provider);
                await this._processGoogleSignInResult(result);
                restoreGoogleBtn();
            } catch (err) {
                console.error(LOG, 'google sign-in:', err.code, err.message);
                restoreGoogleBtn();
                const msg = this._googleSignInErrorMessage(err);
                if (msg) this._showError(panelId, msg);
            }
        },

        // ── Construcción del modal ────────────────────────────────────────

        _buildModal() {
            if (document.getElementById('voltAuthModal')) {
                this._modalEl = document.getElementById('voltAuthModal');
                const gl = document.getElementById('googleLoginBtn');
                const gr = document.getElementById('googleRegisterBtn');
                if (gl) gl.innerHTML = this._googleBtnInnerHTML();
                if (gr) gr.innerHTML = this._googleBtnInnerHTML();
                if (!this._modalEventsBound) {
                    this._bindModalEvents();
                    this._modalEventsBound = true;
                }
                return;
            }

            const wrapper = document.createElement('div');
            wrapper.innerHTML = `
            <div class="modal fade" id="voltAuthModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content auth-modal-content">

                        <div class="auth-modal-header">
                            <div class="auth-tabs">
                                <button class="auth-tab-btn active" data-tab="login">Ingresar</button>
                                <button class="auth-tab-btn" data-tab="register">Crear cuenta</button>
                            </div>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Cerrar"></button>
                        </div>

                        <div class="auth-modal-body">

                            <!-- PANEL: LOGIN -->
                            <div class="auth-tab-panel" id="auth-panel-login">
                                <p class="auth-modal-subtitle">Ingresá para continuar con tu compra</p>
                                <div class="auth-modal-error"></div>
                                <button type="button" id="googleLoginBtn" class="auth-google-btn" aria-label="Continuar con Google"></button>
                                <p class="auth-divider-o" aria-hidden="true">— o —</p>
                                <form id="voltLoginForm" novalidate>
                                    <div class="auth-field">
                                        <label class="auth-label">Email</label>
                                        <input type="email" id="loginEmail" class="auth-input" placeholder="tu@email.com" required>
                                    </div>
                                    <div class="auth-field">
                                        <label class="auth-label">Contraseña</label>
                                        <input type="password" id="loginPassword" class="auth-input" placeholder="••••••••" required>
                                        <button type="button" id="forgotPasswordBtn" class="auth-forgot-link">¿Olvidaste tu contraseña?</button>
                                    </div>
                                    <div class="auth-modal-success" id="resetSuccessMsg" style="display:none;"></div>
                                    <button type="submit" id="loginSubmitBtn" class="auth-submit-btn">Ingresar</button>
                                </form>
                                <p class="auth-modal-note">Si antes ingresaste con Google, usá el botón de arriba.</p>
                            </div>

                            <!-- PANEL: REGISTRO -->
                            <div class="auth-tab-panel" id="auth-panel-register" style="display:none;">
                                <p class="auth-modal-subtitle">Creá tu cuenta para comprar en VOLT</p>
                                <div class="auth-modal-error"></div>
                                <button type="button" id="googleRegisterBtn" class="auth-google-btn" aria-label="Continuar con Google"></button>
                                <p class="auth-divider-o" aria-hidden="true">— o —</p>
                                <form id="voltRegisterForm" novalidate>
                                    <div class="auth-field">
                                        <label class="auth-label">Nombre completo</label>
                                        <input type="text" id="registerName" class="auth-input" placeholder="Juan Pérez" required>
                                    </div>
                                    <div class="auth-field">
                                        <label class="auth-label">Email</label>
                                        <input type="email" id="registerEmail" class="auth-input" placeholder="tu@email.com" required>
                                    </div>
                                    <div class="auth-field">
                                        <label class="auth-label">Contraseña</label>
                                        <input type="password" id="registerPassword" class="auth-input" placeholder="Mínimo 6 caracteres" required>
                                    </div>
                                    <button type="submit" id="registerSubmitBtn" class="auth-submit-btn">Crear cuenta</button>
                                </form>
                                <p class="auth-modal-note">Con tu cuenta vas a poder seguir tus pedidos y comprar más rápido.</p>
                            </div>

                        </div>
                    </div>
                </div>
            </div>`;

            document.body.appendChild(wrapper.firstElementChild);
            this._modalEl = document.getElementById('voltAuthModal');
            document.getElementById('googleLoginBtn').innerHTML = this._googleBtnInnerHTML();
            document.getElementById('googleRegisterBtn').innerHTML = this._googleBtnInnerHTML();
            this._bindModalEvents();
            this._modalEventsBound = true;
        },

        _bindModalEvents() {
            // Cambio de tabs
            this._modalEl.querySelectorAll('.auth-tab-btn').forEach(btn => {
                btn.addEventListener('click', () => this._switchTab(btn.dataset.tab));
            });

            // Olvidé mi contraseña
            document.getElementById('forgotPasswordBtn').addEventListener('click', async () => {
                const email = document.getElementById('loginEmail').value.trim();
                const errorEl = this._modalEl.querySelector('#auth-panel-login .auth-modal-error');
                const successEl = document.getElementById('resetSuccessMsg');

                errorEl.style.display = 'none';
                successEl.style.display = 'none';

                if (!email) {
                    errorEl.textContent = 'Escribí tu email arriba y luego hacé clic en este link.';
                    errorEl.style.display = 'block';
                    document.getElementById('loginEmail').focus();
                    return;
                }

                try {
                    await firebase.auth().sendPasswordResetEmail(email);
                    successEl.textContent = 'Te enviamos un email para restablecer tu contraseña. Revisá tu bandeja de entrada.';
                    successEl.style.display = 'block';
                } catch (err) {
                    const msgs = {
                        'auth/user-not-found': 'No existe una cuenta con ese email.',
                        'auth/invalid-email':  'El email ingresado no es válido.',
                    };
                    errorEl.textContent = msgs[err.code] || 'No pudimos enviar el email. Intentá de nuevo.';
                    errorEl.style.display = 'block';
                }
            });

            // Login
            document.getElementById('voltLoginForm').addEventListener('submit', (e) => {
                e.preventDefault();
                const email    = document.getElementById('loginEmail').value.trim();
                const password = document.getElementById('loginPassword').value;
                const btn      = document.getElementById('loginSubmitBtn');
                if (!email || !password) return;
                this._handleLogin(email, password, btn);
            });

            // Registro
            document.getElementById('voltRegisterForm').addEventListener('submit', (e) => {
                e.preventDefault();
                const name     = document.getElementById('registerName').value.trim();
                const email    = document.getElementById('registerEmail').value.trim();
                const password = document.getElementById('registerPassword').value;
                const btn      = document.getElementById('registerSubmitBtn');
                if (!name || !email || !password) return;
                this._handleRegister(name, email, password, btn);
            });

            document.getElementById('googleLoginBtn').addEventListener('click', () => {
                this._handleGoogleSignIn('auth-panel-login');
            });
            document.getElementById('googleRegisterBtn').addEventListener('click', () => {
                this._handleGoogleSignIn('auth-panel-register');
            });
        },

        // ── Utilidades ───────────────────────────────────────────────────

        /**
         * Devuelve el nombre a mostrar para un usuario:
         * 1. displayName si existe y no está vacío (tras trim)
         * 2. La parte del email antes del @
         */
        _userName(user) {
            const display = (user.displayName || '').trim();
            if (display) return display;
            return (user.email || '').split('@')[0];
        },

        _esc(str) {
            return String(str).replace(/[&<>"']/g, c => (
                { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
            ));
        }
    };

    // ── Inicializar cuando el DOM esté listo ──────────────────────────────
    function boot() {
        VoltStoreAuth.init().catch((err) => console.error(LOG, 'init falló:', err));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.VoltStoreAuth = VoltStoreAuth;
})();
