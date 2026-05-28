const state = {
    deps: null
};

function notify(message) {
    alert(message);
}

function getAdminApiUrl(path) {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (!isLocal) return path;
    const base = (localStorage.getItem('volt_admin_api_base') || 'https://voltculture.com.ar').replace(/\/$/, '');
    return `${base}${path}`;
}

function formatAdminApiError(resp, body) {
    if (resp.status === 405) {
        return 'La API no corre en Live Server (puerto 5500). Usá el sitio en producción, o en la carpeta del proyecto ejecutá: npx vercel dev — y abrí http://localhost:3000/admin/panel.html';
    }
    return body?.error || `Error ${resp.status}`;
}

function getCommonDeps() {
    return {
        db: firebase?.firestore?.(),
        auth: firebase?.auth?.(),
        storage: firebase?.storage?.(),
        getAdminToken: () => window.VoltAdminAuth.getIdToken(),
        getAdminApiUrl,
        formatAdminApiError
    };
}

function setupTabs() {
    document.querySelectorAll('.admin-tab').forEach((tab) => {
        tab.addEventListener('click', function onTabClick() {
            document.querySelectorAll('.admin-tab').forEach((t) => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

            this.classList.add('active');
            const tabId = this.getAttribute('data-tab');
            document.getElementById(`tab-${tabId}`).classList.add('active');

            if (tabId === 'pedidos') {
                state.deps.AdminOrders.loadOrders();
            }
        });
    });
}

async function runCleanup(target, label) {
    const confirmed = confirm(`⚠️ ¿Estás seguro que querés eliminar ${label}?\n\nEsta acción es IRREVERSIBLE.`);
    if (!confirmed) return;

    const btn = document.getElementById(`clean${target === 'orders' ? 'Orders' : target === 'products' ? 'Products' : 'All'}Btn`);
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Eliminando...';

    try {
        const token = await window.VoltAdminAuth.getIdToken();
        const resp = await fetch(getAdminApiUrl('/api/admin-cleanup'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ target })
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(formatAdminApiError(resp, err));
        }
        const data = await resp.json();
        const lines = Object.entries(data.deleted)
            .map(([col, n]) => `• ${col}: ${n} documentos eliminados`)
            .join('\n');
        notify(`✅ Limpieza completada:\n${lines}`);

        if (target === 'orders' || target === 'all') await state.deps.AdminOrders.loadOrders();
        if (target === 'products' || target === 'all') await state.deps.AdminProducts.loadProducts();
    } catch (err) {
        notify(`❌ Error en la limpieza: ${err.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function bindCleanupButtons() {
    document.getElementById('cleanOrdersBtn').addEventListener('click', () => runCleanup('orders', 'todos los pedidos'));
    document.getElementById('cleanProductsBtn').addEventListener('click', () => runCleanup('products', 'todos los productos'));
    document.getElementById('cleanAllBtn').addEventListener('click', () => runCleanup('all', 'TODOS los pedidos y productos'));
}

async function initAdminPanel() {
    const firebaseOk = window.FirebaseConfig.init();
    const statusEl = document.getElementById('firebaseStatus');
    const configAlert = document.getElementById('configAlert');

    if (firebaseOk) {
        statusEl.textContent = '✅ Conectado';
        statusEl.className = 'firebase-status firebase-connected';
    } else {
        statusEl.textContent = '⚠️ No configurado';
        statusEl.className = 'firebase-status firebase-disconnected';
        configAlert.style.display = 'block';
    }

    const commonDeps = getCommonDeps();
    state.deps.AdminProducts.init(commonDeps);
    state.deps.AdminOrders.init(commonDeps);
    await state.deps.AdminProducts.loadProducts();
}

function init(deps = {}) {
    state.deps = deps;
    setupTabs();
    bindCleanupButtons();
    window.initAdminPanel = initAdminPanel;
}

window.AdminUI = { init, initAdminPanel, getAdminApiUrl, formatAdminApiError };

export { init, initAdminPanel, getAdminApiUrl, formatAdminApiError };
