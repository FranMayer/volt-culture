/**
 * Helpers puros para cupones de descuento.
 * Sin dependencias de red: el documento Firestore se busca en cada endpoint
 * y se le pasa `data` a estas funciones (testeable sin Firestore).
 */

/** Normaliza un código: trim, mayúsculas, sin espacios internos. */
export function normalizeCouponCode(code) {
    return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

/** Firestore Timestamp | string | number | Date -> Date (o null). */
function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {object|null} data - data del doc Firestore (o null si no existe)
 * @param {Date} [now]
 * @returns {{ valid: boolean, reason?: string }}
 */
export function isCouponValid(data, now = new Date()) {
    if (!data) return { valid: false, reason: 'not_found' };
    if (data.active !== true) return { valid: false, reason: 'inactive' };
    const percent = Number(data.percent);
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
        return { valid: false, reason: 'bad_percent' };
    }
    const exp = toDate(data.expiresAt);
    if (exp && exp.getTime() <= now.getTime()) {
        return { valid: false, reason: 'expired' };
    }
    const maxUses = Number(data.maxUses);
    if (Number.isInteger(maxUses) && maxUses > 0 && (Number(data.usedCount) || 0) >= maxUses) {
        return { valid: false, reason: 'exhausted' };
    }
    return { valid: true };
}

/** Descuento entero (redondeado) sobre el total de productos. */
export function computeCouponDiscount(productsTotal, percent) {
    return Math.round(Number(productsTotal || 0) * Number(percent) / 100);
}
