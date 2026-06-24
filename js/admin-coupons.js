/**
 * VOLT Admin — Cupones de descuento.
 * Colección Firestore `coupons` (doc id = código normalizado). Firebase compat.
 */

function normalizeCouponCode(code) {
    return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

const db = () => firebase.firestore();

function renderRow(doc) {
    const c = doc.data();
    const active = c.active === true;
    const expires = c.expiresAt && typeof c.expiresAt.toDate === 'function'
        ? c.expiresAt.toDate().toLocaleDateString('es-AR')
        : '—';
    return `<tr>
        <td>${c.code}</td>
        <td>${c.percent}%</td>
        <td>${active ? 'Activo' : 'Inactivo'}</td>
        <td>${expires}</td>
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
    tbody.innerHTML = '<tr><td colspan="5">Cargando…</td></tr>';
    try {
        const snap = await db().collection('coupons').orderBy('createdAt', 'desc').get();
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="5">Todavía no hay cupones.</td></tr>';
            return;
        }
        tbody.innerHTML = snap.docs.map(renderRow).join('');
        bindRowActions(tbody);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5">Error: ${e.message}</td></tr>`;
    }
}

export async function createCoupon() {
    const codeEl = document.getElementById('couponCodeInput');
    const percentEl = document.getElementById('couponPercentInput');
    const expiresEl = document.getElementById('couponExpiresInput');
    const code = normalizeCouponCode(codeEl.value);
    const percent = Number(percentEl.value);
    if (!code) { alert('Ingresá un código.'); return; }
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
        alert('El % debe ser un entero entre 1 y 100.');
        return;
    }
    const data = {
        code,
        percent,
        active: true,
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
