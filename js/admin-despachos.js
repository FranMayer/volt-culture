let moduleDeps = {
    db: null,
    auth: null,
    getAdminToken: null
};

let allDespachos = [];

function getDb() {
    if (moduleDeps.db) return moduleDeps.db;
    return window.FirebaseConfig.getDb();
}

async function getAdminToken() {
    if (typeof moduleDeps.getAdminToken === 'function') {
        return moduleDeps.getAdminToken();
    }
    return window.VoltAdminAuth.getIdToken();
}

function getAdminApiUrl(path) {
    if (typeof moduleDeps.getAdminApiUrl === 'function') {
        return moduleDeps.getAdminApiUrl(path);
    }
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (!isLocal) return path;
    const base = (localStorage.getItem('volt_admin_api_base') || 'https://voltculture.com.ar').replace(/\/$/, '');
    return `${base}${path}`;
}

function formatAdminApiError(resp, body) {
    if (typeof moduleDeps.formatAdminApiError === 'function') {
        return moduleDeps.formatAdminApiError(resp, body);
    }
    if (resp.status === 405) {
        return 'La API no corre en Live Server (puerto 5500). Usá el sitio en producción, o en la carpeta del proyecto ejecutá: npx vercel dev — y abrí http://localhost:3000/admin/panel.html';
    }
    return body?.error || `Error ${resp.status}`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function needsAndreaniAddress(shipping) {
    return shipping?.type === 'andreani' || shipping?.method === 'andreani' || shipping?.method === 'correo';
}

function needsDespacho(order) {
    if (order.status !== 'paid' && order.status !== 'shipped') return false;
    return needsAndreaniAddress(order.shipping);
}

function renderDespachoRow(order) {
    const created = order.createdAt?.toDate ? order.createdAt.toDate() : null;
    const dateStr = created ? created.toLocaleString('es-AR') : '-';
    const address = order.shipping?.address || {};
    const destino = `${escapeHtml(address.city || '-')}, ${escapeHtml(address.province || '-')} — CP ${escapeHtml(address.postalCode || '-')}`;
    const numeroDeEnvio = order.shipping?.andreani?.numeroDeEnvio;

    let estadoHtml;
    let accionesHtml;
    if (numeroDeEnvio) {
        const trackUrl = `https://www.andreani.com/#!/informacionEnvio/${encodeURIComponent(numeroDeEnvio)}`;
        estadoHtml = `<small>Nº ${escapeHtml(numeroDeEnvio)}</small><br><a href="${trackUrl}" target="_blank" rel="noopener">Ver tracking</a>`;
        accionesHtml = `<button class="btn btn-sm btn-detail" data-numero-envio="${escapeHtml(numeroDeEnvio)}">Ver etiqueta</button>`;
    } else {
        estadoHtml = `<span class="order-status status-pending">Pendiente de despacho</span>`;
        accionesHtml = `<button class="btn btn-sm btn-volt" data-order-id="${escapeHtml(order.id)}">Generar orden Andreani</button>`;
    }

    return `
        <tr>
            <td style="white-space: nowrap;">${dateStr}</td>
            <td><small>${escapeHtml(order.orderId || order.id)}</small></td>
            <td>
                <strong>${escapeHtml(order.customer?.name || 'Cliente')}</strong><br>
                <small style="color: rgba(255,255,255,0.5)">${escapeHtml(order.customer?.email || '-')}</small>
            </td>
            <td>${destino}</td>
            <td>${estadoHtml}</td>
            <td>${accionesHtml}</td>
        </tr>
    `;
}

async function loadDespachos() {
    const tbody = document.getElementById('despachosTable');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4"><div class="spinner-border text-danger" role="status"><span class="visually-hidden">Cargando...</span></div></td></tr>`;

    try {
        if (!window.FirebaseConfig.isInitialized()) {
            tbody.innerHTML = `<tr><td colspan="6" class="orders-empty"><p>Firebase no está configurado</p></td></tr>`;
            return;
        }

        const snapshot = await getDb().collection('orders').orderBy('createdAt', 'desc').limit(200).get();
        allDespachos = [];
        snapshot.forEach((doc) => {
            const order = { id: doc.id, ...doc.data() };
            if (needsDespacho(order)) allDespachos.push(order);
        });

        if (allDespachos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="orders-empty"><p>No hay despachos pendientes</p></td></tr>`;
            return;
        }

        tbody.innerHTML = allDespachos.map((order) => renderDespachoRow(order)).join('');
    } catch (error) {
        console.error('Error al cargar despachos:', error);
        tbody.innerHTML = `<tr><td colspan="6" class="orders-empty"><p>Error al cargar despachos</p><small style="color: rgba(255,255,255,0.3)">${escapeHtml(error.message)}</small></td></tr>`;
    }
}

// ponytail: separa "calle" y "numero" de un string tipo "Av. Colón 1234" — cubre el
// caso típico (calle + numero al final); direcciones sin numero al final quedan como 'S/N'.
function splitStreet(street) {
    const s = String(street || '').trim();
    const m = s.match(/^(.*?)[,\s]+(\d+\s*\S*)\s*$/);
    return {
        calle: m ? m[1].trim() : s,
        numero: m ? m[2].trim() : 'S/N'
    };
}

function bultoUnitFor(title) {
    return /hoodie|buzo/i.test(title || '')
        ? { kilos: 0.7, volumenCm3: 6000 }
        : { kilos: 0.3, volumenCm3: 3000 };
}

function buildBulto(order) {
    let kilos = 0;
    let volumenCm3 = 0;
    (order.items || []).forEach((item) => {
        const qty = Number(item.quantity) || 0;
        const unit = bultoUnitFor(item.title || item.name);
        kilos += unit.kilos * qty;
        volumenCm3 += unit.volumenCm3 * qty;
    });
    return {
        kilos: Math.round(kilos * 100) / 100,
        volumenCm3,
        valorDeclarado: order.total || 0
    };
}

async function generarOrdenAndreani(orderId, btnEl) {
    const order = allDespachos.find((o) => o.id === orderId);
    if (!order) {
        alert('No se encontró la orden. Actualizá la lista e intentá de nuevo.');
        return;
    }

    const address = order.shipping?.address || {};
    const { calle, numero } = splitStreet(address.street);
    const destinoResumen = `${calle} ${numero}, ${address.city || '-'}, ${address.province || '-'} (CP ${address.postalCode || '-'})`;
    const confirmed = confirm(`¿Generar orden de envío Andreani para el pedido ${order.orderId || order.id}?\n\nDestino: ${destinoResumen}`);
    if (!confirmed) return;

    const body = {
        orderId: order.id,
        destinatario: {
            nombreCompleto: order.customer?.name || '',
            email: order.customer?.email || '',
            documentoNumero: order.customer?.dni || '',
            telefono: order.customer?.phone || ''
        },
        destino: {
            postal: {
                codigoPostal: address.postalCode || '',
                calle,
                numero,
                localidad: address.city || '',
                region: address.province || ''
            }
        },
        bultos: [buildBulto(order)]
    };

    const originalText = btnEl ? btnEl.textContent : '';
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.textContent = 'Generando...';
    }

    try {
        const token = await getAdminToken();
        const resp = await fetch(getAdminApiUrl('/api/crear-orden-andreani'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(formatAdminApiError(resp, err));
        }
        const data = await resp.json();
        alert(`✅ Orden Andreani generada. Número de envío: ${data.numeroDeEnvio}`);
        await loadDespachos();
    } catch (error) {
        alert(`❌ No se pudo generar la orden Andreani: ${error.message}`);
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.textContent = originalText;
        }
    }
}

async function verEtiqueta(numeroDeEnvio, btnEl) {
    const originalText = btnEl ? btnEl.textContent : '';
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.textContent = 'Abriendo...';
    }

    try {
        const token = await getAdminToken();
        const resp = await fetch(getAdminApiUrl(`/api/etiqueta-andreani?numeroAndreani=${encodeURIComponent(numeroDeEnvio)}`), {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(formatAdminApiError(resp, err));
        }
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        // Revocamos recién después de un rato: revocarla ya mismo puede romper la
        // pestaña recién abierta si todavía está cargando el blob.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
        alert(`❌ No se pudo obtener la etiqueta: ${error.message}`);
    } finally {
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.textContent = originalText;
        }
    }
}

function handleDespachosTableClick(event) {
    const generarBtn = event.target.closest('[data-order-id]');
    if (generarBtn) {
        generarOrdenAndreani(generarBtn.dataset.orderId, generarBtn);
        return;
    }
    const etiquetaBtn = event.target.closest('[data-numero-envio]');
    if (etiquetaBtn) {
        verEtiqueta(etiquetaBtn.dataset.numeroEnvio, etiquetaBtn);
    }
}

function init(deps = {}) {
    moduleDeps = { ...moduleDeps, ...deps };

    const refreshBtn = document.getElementById('refreshDespachos');
    if (refreshBtn) refreshBtn.addEventListener('click', loadDespachos);

    const table = document.getElementById('despachosTable');
    if (table) table.addEventListener('click', handleDespachosTableClick);
}

window.AdminDespachos = {
    init,
    loadDespachos,
    generarOrdenAndreani,
    verEtiqueta
};

export {
    init,
    loadDespachos,
    generarOrdenAndreani,
    verEtiqueta
};
