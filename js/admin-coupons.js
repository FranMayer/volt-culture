/**
 * VOLT Admin — Cupones de descuento.
 * Colección Firestore `coupons` (doc id = código normalizado). Firebase compat.
 */

function normalizeCouponCode(code) {
    return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

const db = () => firebase.firestore();

function renderRow(doc) {
    const c = doc.data();
    const active = c.active === true;
    const expires = c.expiresAt && typeof c.expiresAt.toDate === 'function'
        ? c.expiresAt.toDate().toLocaleDateString('es-AR')
        : '—';
    const usedCount = Number(c.usedCount) || 0;
    const maxUses = Number(c.maxUses);
    const uses = Number.isInteger(maxUses) && maxUses > 0 ? `${usedCount}/${maxUses}` : `${usedCount}/∞`;
    return `<tr>
        <td>${escapeHtml(c.code)}</td>
        <td>${c.percent}%</td>
        <td>${active ? 'Activo' : 'Inactivo'}</td>
        <td>${expires}</td>
        <td>${uses}</td>
        <td>
            <button class="btn btn-sm btn-outline-light me-1" data-coupon-toggle="${doc.id}">${active ? 'Desactivar' : 'Activar'}</button>
            <button class="btn btn-sm" style="background:#780000;color:#fff;border:none;" data-coupon-delete="${doc.id}">Borrar</button>
        </td>
    </tr>`;
}

function bindRowActions(tbody) {
    tbody.querySelectorAll('[data-coupon-toggle]').forEach((b) =>
        b.addEventListener('click', () => toggleCoupon(b.getAttribute('data-coupon-toggle'))));
    tbody.querySelectorAll('[data-coupon-delete]').forEach((b) =>
        b.addEventListener('click', () => deleteCoupon(b.getAttribute('data-coupon-delete'))));
}

export async function loadCoupons() {
    const tbody = document.getElementById('couponsTable');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6">Cargando…</td></tr>';
    try {
        const snap = await db().collection('coupons').orderBy('createdAt', 'desc').get();
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="6">Todavía no hay cupones.</td></tr>';
            return;
        }
        tbody.innerHTML = snap.docs.map(renderRow).join('');
        bindRowActions(tbody);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6">Error: ${e.message}</td></tr>`;
    }
}

export async function createCoupon() {
    const codeEl = document.getElementById('couponCodeInput');
    const percentEl = document.getElementById('couponPercentInput');
    const expiresEl = document.getElementById('couponExpiresInput');
    const maxUsesEl = document.getElementById('couponMaxUsesInput');
    const code = normalizeCouponCode(codeEl.value);
    const percent = Number(percentEl.value);
    if (!code) { alert('Ingresá un código.'); return; }
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
        alert('El % debe ser un entero entre 1 y 100.');
        return;
    }
    const maxUsesRaw = maxUsesEl ? Number(maxUsesEl.value) : NaN;
    const maxUses = Number.isInteger(maxUsesRaw) && maxUsesRaw > 0 ? maxUsesRaw : null;
    const data = {
        code,
        percent,
        active: true,
        maxUses,
        usedCount: 0,
        expiresAt: expiresEl && expiresEl.value
            ? firebase.firestore.Timestamp.fromDate(new Date(expiresEl.value + 'T23:59:59'))
            : null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    try {
        await db().collection('coupons').doc(code).set(data);
        codeEl.value = '';
        percentEl.value = '';
        if (expiresEl) expiresEl.value = '';
        if (maxUsesEl) maxUsesEl.value = '';
        await loadCoupons();
    } catch (e) {
        alert('No se pudo crear el cupón: ' + e.message);
    }
}

async function toggleCoupon(id) {
    const ref = db().collection('coupons').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return;
    await ref.update({
        active: !(snap.data().active === true),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await loadCoupons();
}

async function deleteCoupon(id) {
    if (!confirm(`¿Borrar el cupón ${id}? Esta acción es irreversible.`)) return;
    await db().collection('coupons').doc(id).delete();
    await loadCoupons();
}

export function init() {
    const form = document.getElementById('couponForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            createCoupon();
        });
    }
}
