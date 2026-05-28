let moduleDeps = {
    db: null,
    auth: null,
    getAdminToken: null
};

let allOrders = [];
let selectedOrder = null;

const STATUS_CLASSES = {
    pending: 'status-pending',
    pending_payment: 'status-pending-payment',
    paid: 'status-paid',
    shipped: 'status-shipped',
    delivered: 'status-delivered',
    failed: 'status-failed',
    mp_error: 'status-mp-error',
    cancelled: 'status-cancelled'
};

const STATUS_LABELS = {
    pending: 'Pendiente',
    pending_payment: 'Pendiente pago',
    paid: 'Pagado',
    shipped: 'Enviado',
    delivered: 'Entregado',
    failed: 'Fallido',
    mp_error: 'Error MP',
    cancelled: 'Cancelado'
};

const SHIPPING_LABELS = {
    cadete: 'Cadete en moto (Córdoba Capital)',
    cordoba: 'Envío Córdoba Capital (circunvalación)',
    andreani: 'Andreani / Interior',
    correo: 'Correo Argentino',
    coordinar: 'Coordinar entrega'
};

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

function getStatusClass(status) {
    return STATUS_CLASSES[status] || 'status-pending';
}

function getStatusLabel(status) {
    return STATUS_LABELS[status] || status || 'Desconocido';
}

function needsAddressShipping(shipping) {
    return shipping?.type === 'andreani' || shipping?.method === 'andreani' || shipping?.method === 'correo';
}

function adminShippingHtml(o) {
    const s = o.shipping;
    const shipKey = s?.method || s?.type;
    if (s && shipKey) {
        const needsAddress = needsAddressShipping(s);
        const bits = [`<strong>Envío:</strong> ${SHIPPING_LABELS[shipKey] || shipKey}`];
        if (s.cost != null && shipKey === 'cordoba') {
            bits.push(`<strong>Costo envío:</strong> $${Number(s.cost).toLocaleString('es-AR')}`);
        }
        if (s.note) bits.push(`<strong>Nota:</strong> ${s.note}`);
        if (needsAddress) {
            const a = s.address || {};
            bits.push(`<strong>Dirección:</strong> ${a.street || '-'}`);
            bits.push(`${a.city || '-'}, ${a.province || '-'} — CP ${a.postalCode || '-'}`);
        } else if (s.type === 'cordoba') {
            bits.push('<span style="color:rgba(255,255,255,0.5)">Entrega local — coordinar por WhatsApp</span>');
        } else if (s.method === 'cadete') {
            bits.push('<span style="color:rgba(255,255,255,0.5)">Coordinar entrega por WhatsApp</span>');
        }
        if (s.notes) bits.push(`<strong>Nota:</strong> ${s.notes}`);
        if (needsAddress && s.trackingNumber) {
            const trackUrl = `https://www.andreani.com/#!/informacionEnvio/${encodeURIComponent(s.trackingNumber)}`;
            bits.push(`<strong>Tracking ${s.carrier || 'Andreani'}:</strong> <a href="${trackUrl}" target="_blank" rel="noopener">${s.trackingNumber}</a>`);
        }
        return bits.join('<br>');
    }
    const legacy = o.shipping;
    const legacyNeedsAddress = needsAddressShipping(legacy);
    if (legacyNeedsAddress && legacy?.trackingNumber) {
        const trackUrl = `https://www.andreani.com/#!/informacionEnvio/${encodeURIComponent(legacy.trackingNumber)}`;
        return `<strong>Tracking Andreani:</strong> <a href="${trackUrl}" target="_blank" rel="noopener">${legacy.trackingNumber}</a>`;
    }
    return `<strong>Dirección:</strong> ${o.customer?.address || '-'}`;
}

function adminShippingPlain(o) {
    const s = o.shipping;
    const shipKey = s?.method || s?.type;
    if (s && shipKey) {
        const needsAddress = needsAddressShipping(s);
        let t = `Envío: ${SHIPPING_LABELS[shipKey] || shipKey}\n`;
        if (s.cost != null && shipKey === 'cordoba') t += `Costo envío: $${Number(s.cost).toLocaleString('es-AR')}\n`;
        if (s.note) t += `Nota: ${s.note}\n`;
        if (needsAddress) {
            const a = s.address || {};
            t += `Calle: ${a.street || ''}\nCiudad: ${a.city || ''}\nProvincia: ${a.province || ''}\nCP: ${a.postalCode || ''}\n`;
        } else if (s.type === 'cordoba') {
            t += 'Entrega local — coordinar por WhatsApp\n';
        }
        if (s.notes) t += `Nota: ${s.notes}\n`;
        if (needsAddress && s.trackingNumber) {
            t += `Tracking ${s.carrier || 'Andreani'}: ${s.trackingNumber}\n`;
            t += `https://www.andreani.com/#!/informacionEnvio/${s.trackingNumber}\n`;
        }
        return t.trimEnd();
    }
    const legacy = o.shipping;
    const legacyNeedsAddress = needsAddressShipping(legacy);
    if (legacyNeedsAddress && legacy?.trackingNumber) {
        return `Tracking Andreani: ${legacy.trackingNumber}\nhttps://www.andreani.com/#!/informacionEnvio/${legacy.trackingNumber}`;
    }
    return `Direccion: ${o.customer?.address || '-'}`;
}

function updateOrderStats(orders) {
    const paid = orders.filter((o) => o.status === 'paid');
    const pending = orders.filter((o) => o.status === 'pending' || o.status === 'pending_payment');
    const totalRevenue = paid.reduce((sum, o) => sum + (o.total || 0), 0);
    document.getElementById('totalOrders').textContent = orders.length;
    document.getElementById('approvedOrders').textContent = paid.length;
    document.getElementById('pendingOrders').textContent = pending.length;
    document.getElementById('totalRevenue').textContent = `$${totalRevenue.toLocaleString('es-AR')}`;
}

function renderOrderCard(order) {
    const created = order.createdAt?.toDate ? order.createdAt.toDate() : null;
    const dateStr = created ? created.toLocaleString('es-AR') : '-';
    const itemsStr = (order.items || []).map((i) => `${i.title || i.name} x${i.quantity}`).join('<br>') || '-';
    return `
        <tr>
            <td style="white-space: nowrap;">${dateStr}</td>
            <td><small>${order.orderId || order.id}</small></td>
            <td>
                <strong>${order.customer?.name || 'Cliente'}</strong><br>
                <small style="color: rgba(255,255,255,0.5)">${order.customer?.email || '-'}</small>
            </td>
            <td class="order-items">${itemsStr}</td>
            <td class="order-amount">$${(order.total || 0).toLocaleString('es-AR')}</td>
            <td><span class="order-status ${getStatusClass(order.status)}">${getStatusLabel(order.status)}</span></td>
            <td><button class="btn btn-sm btn-detail" onclick="openOrderDetail('${order.id}')">Ver detalle</button></td>
        </tr>
    `;
}

function renderOrders(orders) {
    const tbody = document.getElementById('ordersTable');
    if (orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="orders-empty"><div class="orders-empty-icon">🔍</div><p>No hay pedidos para ese filtro</p></td></tr>`;
        return;
    }
    tbody.innerHTML = orders.map((order) => renderOrderCard(order)).join('');
}

async function loadOrders() {
    const tbody = document.getElementById('ordersTable');
    const statusFilter = document.getElementById('orderStatusFilter').value;
    const dateFilter = document.getElementById('orderDateFilter').value;
    const search = (document.getElementById('orderSearch').value || '').trim().toLowerCase();

    try {
        if (!window.FirebaseConfig.isInitialized()) {
            tbody.innerHTML = `<tr><td colspan="7" class="orders-empty"><div class="orders-empty-icon">⚠️</div><p>Firebase no está configurado</p></td></tr>`;
            return;
        }

        const snapshot = await getDb().collection('orders').orderBy('createdAt', 'desc').limit(200).get();
        allOrders = [];
        snapshot.forEach((doc) => allOrders.push({ id: doc.id, ...doc.data() }));

        const filtered = allOrders.filter((order) => {
            if (statusFilter !== 'all' && order.status !== statusFilter) return false;

            const created = order.createdAt?.toDate ? order.createdAt.toDate() : null;
            if (dateFilter !== 'all' && created) {
                const now = new Date();
                if (dateFilter === 'today') {
                    if (created.toDateString() !== now.toDateString()) return false;
                } else if (dateFilter === 'week') {
                    const weekAgo = new Date(now);
                    weekAgo.setDate(now.getDate() - 7);
                    if (created < weekAgo) return false;
                } else if (dateFilter === 'month') {
                    const monthAgo = new Date(now);
                    monthAgo.setMonth(now.getMonth() - 1);
                    if (created < monthAgo) return false;
                }
            }

            if (search) {
                const haystack = `${order.orderId || ''} ${order.customer?.email || ''}`.toLowerCase();
                if (!haystack.includes(search)) return false;
            }
            return true;
        });

        renderOrders(filtered);
        updateOrderStats(allOrders);
    } catch (error) {
        console.error('Error al cargar pedidos:', error);
        tbody.innerHTML = `<tr><td colspan="7" class="orders-empty"><div class="orders-empty-icon">❌</div><p>Error al cargar pedidos</p><small style="color: rgba(255,255,255,0.3)">${(error.code === 'permission-denied' || /permission/i.test(error.message)) ? 'Sin permiso admin en Firestore. Cerrá sesión, ejecutá set-admin.mjs y volvé a ingresar.' : error.message}</small></td></tr>`;
    }
}

function cleanupOrphanModalState() {
    if (document.querySelector('.modal.show')) return;
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
}

function closeOrderDetail() {
    const orderModalEl = document.getElementById('orderDetailModal');
    const orderModal = bootstrap.Modal.getInstance(orderModalEl);
    if (orderModal) orderModal.hide();
    cleanupOrphanModalState();
}

async function notifyStatus(orderId, newStatus, trackingNumber) {
    const token = await getAdminToken();
    const payload = { orderId, status: newStatus };
    if (newStatus === 'shipped') {
        payload.trackingNumber = trackingNumber || '';
    }
    const resp = await fetch(getAdminApiUrl('/api/notify-status'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(formatAdminApiError(resp, err));
    }
    return resp.json();
}

async function updateOrderStatus(orderId, newStatus, trackingNumber = '') {
    await notifyStatus(orderId, newStatus, trackingNumber);
    await loadOrders();
}

async function saveTracking(orderId, trackingNumber) {
    await updateOrderStatus(orderId, 'shipped', trackingNumber || '');
}

async function openOrderDetail(orderId) {
    const doc = await getDb().collection('orders').doc(orderId).get();
    if (!doc.exists) return;
    selectedOrder = { id: doc.id, ...doc.data() };
    const o = selectedOrder;
    const items = (o.items || []).map((i) => `
        <li style="margin-bottom:8px;">
            ${i.image ? `<img src="${escapeHtml(i.image)}" style="width:46px;height:46px;object-fit:cover;border:1px solid #44464c;margin-right:8px;" onerror="this.style.display='none'">` : ''}
            ${i.title || i.name} ${i.variantColor ? `| ${i.variantColor}` : ''} ${i.variantSize ? `| ${i.variantSize}` : ''} x${i.quantity} - $${Number(i.price || 0).toLocaleString('es-AR')}
        </li>
    `).join('');
    document.getElementById('orderDetailBody').innerHTML = `
        <p><strong>Order:</strong> ${o.orderId || o.id}</p>
        <p><strong>Cliente:</strong> ${o.customer?.name || '-'}<br>
        <strong>Email:</strong> ${o.customer?.email || '-'}<br>
        <strong>Tel:</strong> ${o.customer?.phone || '-'}<br>
        ${adminShippingHtml(o)}</p>
        <ul style="padding-left:18px;">${items}</ul>
        <p><strong>Total:</strong> $${Number(o.total || 0).toLocaleString('es-AR')}</p>
        <p><strong>Estado:</strong> <span class="order-status ${getStatusClass(o.status)}">${getStatusLabel(o.status)}</span></p>
        <div class="d-flex gap-2 align-items-center">
            <select class="form-select form-select-sm" id="manualOrderStatus" style="width:auto;">
                <option value="paid">Pagado</option>
                <option value="shipped">Enviado</option>
                <option value="delivered">Entregado</option>
                <option value="cancelled">Cancelado</option>
                <option value="pending_payment">Pago pendiente</option>
            </select>
            <button class="btn btn-volt btn-sm" id="saveOrderStatusBtn">Actualizar estado</button>
        </div>
        <div id="shippedTrackingPanel" class="shipped-tracking-panel d-none mt-3">
            <p class="small text-secondary mb-2">Opcional pero recomendado: el cliente lo recibirá por email con link de seguimiento en Andreani.</p>
            <label class="form-label" for="andreaniTrackingInput">Número de tracking Andreani</label>
            <input type="text" class="form-control form-control-sm" id="andreaniTrackingInput" placeholder="Ej: 1234567890" autocomplete="off">
        </div>
        <div id="shippedCordobaPanel" class="shipped-tracking-panel d-none mt-3">
            <p class="small mb-0" style="color:rgba(255,255,255,0.65);">Entrega local — coordinar por WhatsApp</p>
        </div>
    `;
    const statusSelect = document.getElementById('manualOrderStatus');
    const trackingPanel = document.getElementById('shippedTrackingPanel');
    const cordobaPanel = document.getElementById('shippedCordobaPanel');
    const trackingInput = document.getElementById('andreaniTrackingInput');
    const ship = o.shipping || {};
    const needsAddress = needsAddressShipping(ship);
    const isCordoba = ship.type === 'cordoba';

    statusSelect.value = ['paid', 'shipped', 'delivered', 'cancelled', 'pending_payment'].includes(o.status) ? o.status : 'paid';

    function syncShippedTrackingPanel() {
        const isShipped = statusSelect.value === 'shipped';
        if (isCordoba) {
            trackingPanel.classList.add('d-none');
            cordobaPanel.classList.toggle('d-none', !isShipped);
            return;
        }
        cordobaPanel.classList.add('d-none');
        if (needsAddress) {
            trackingPanel.classList.toggle('d-none', !isShipped);
            if (isShipped) {
                trackingInput.value = o.shipping?.trackingNumber || '';
            }
            return;
        }
        trackingPanel.classList.add('d-none');
    }
    statusSelect.addEventListener('change', syncShippedTrackingPanel);
    syncShippedTrackingPanel();

    document.getElementById('saveOrderStatusBtn').onclick = async () => {
        const newStatus = statusSelect.value;
        const saveBtn = document.getElementById('saveOrderStatusBtn');
        const trackingNumber = newStatus === 'shipped' && needsAddress ? (trackingInput.value || '').trim() : '';
        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';
        try {
            await updateOrderStatus(o.id, newStatus, trackingNumber);
            closeOrderDetail();
        } catch (err) {
            alert(`❌ No se pudo actualizar el estado: ${err.message}`);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Actualizar estado';
        }
    };

    const orderModalEl = document.getElementById('orderDetailModal');
    cleanupOrphanModalState();
    let orderModal = bootstrap.Modal.getInstance(orderModalEl);
    if (!orderModal) orderModal = new bootstrap.Modal(orderModalEl);
    orderModal.show();
}

function init(deps = {}) {
    moduleDeps = { ...moduleDeps, ...deps };

    document.getElementById('copyShippingBtn').addEventListener('click', async () => {
        if (!selectedOrder) return;
        const o = selectedOrder;
        const items = (o.items || []).map((i) => `- ${i.title || i.name} x${i.quantity}`).join('\n');
        const text = `Nombre: ${o.customer?.name || '-'}\nTelefono: ${o.customer?.phone || '-'}\nEmail: ${o.customer?.email || '-'}\n${adminShippingPlain(o)}\n\nProductos:\n${items}`;
        await navigator.clipboard.writeText(text);
        alert('✅ Datos de envío copiados');
    });

    document.getElementById('refreshOrders').addEventListener('click', loadOrders);
    document.getElementById('orderStatusFilter').addEventListener('change', loadOrders);
    document.getElementById('orderDateFilter').addEventListener('change', loadOrders);
    document.getElementById('orderSearch').addEventListener('input', loadOrders);

    window.openOrderDetail = openOrderDetail;
    window.closeOrderDetail = closeOrderDetail;
    window.updateOrderStatus = updateOrderStatus;
    window.saveTracking = saveTracking;
}

window.AdminOrders = {
    init,
    loadOrders,
    renderOrders,
    renderOrderCard,
    openOrderDetail,
    closeOrderDetail,
    updateOrderStatus,
    saveTracking,
    notifyStatus,
    adminShippingHtml,
    adminShippingPlain
};

export {
    init,
    loadOrders,
    renderOrders,
    renderOrderCard,
    openOrderDetail,
    closeOrderDetail,
    updateOrderStatus,
    saveTracking,
    notifyStatus,
    adminShippingHtml,
    adminShippingPlain
};
