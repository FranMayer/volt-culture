import { SHIPPING_CONFIG } from '../js/shipping-config.js';

function formatShippingCostArs(amount) {
    return Number(amount).toLocaleString('es-AR');
}

/** Textos para checkout actual (shipping.type: cordoba | andreani). */
export const SHIPPING_TYPE_DISPLAY = {
    cordoba: `Envío a ${SHIPPING_CONFIG.cordoba.label} — $${formatShippingCostArs(SHIPPING_CONFIG.cordoba.cost)}`,
    andreani: `${SHIPPING_CONFIG.andreani.label} — a coordinar dirección`
};

/** Pedidos anteriores con shipping.method. */
const SHIPPING_METHOD_LABELS = {
    cadete: 'Cadete en moto (Córdoba Capital)',
    andreani: 'Andreani',
    correo: 'Correo Argentino',
    coordinar: 'Coordinar entrega'
};

function escapeHtmlAttr(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function plainText(s) {
    return String(s ?? '')
        .trim()
        .replace(/\r\n/g, '\n');
}

/**
 * Tipo de envío del checkout (shipping.type). No mezcla con method legado.
 * @returns {'cordoba'|'andreani'|null}
 */
export function resolveShippingType(shipping) {
    if (!shipping || typeof shipping !== 'object') return null;
    const type = String(shipping.type || '').trim().toLowerCase();
    if (type === 'cordoba' || type === 'andreani') return type;
    return null;
}

function resolveLegacyShippingMethod(shipping) {
    if (!shipping || typeof shipping !== 'object') return null;
    const method = String(shipping.method || '').trim().toLowerCase();
    if (method && SHIPPING_METHOD_LABELS[method]) return method;
    return null;
}

/** Bloque HTML de envío para el cliente. */
export function formatShippingBlockClientHtml(orderData) {
    const s = orderData.shipping;
    const type = resolveShippingType(s);
    if (type) {
        const label = escapeHtmlAttr(SHIPPING_TYPE_DISPLAY[type]);
        return `<p style="margin:0 0 12px 0;"><strong>Envío:</strong> ${label}</p>`;
    }

    const legacyMethod = resolveLegacyShippingMethod(s);
    if (legacyMethod) {
        const label = escapeHtmlAttr(SHIPPING_METHOD_LABELS[legacyMethod]);
        const parts = [`<p style="margin:0 0 8px 0;"><strong>Método de envío:</strong> ${label}</p>`];
        if (legacyMethod === 'andreani' || legacyMethod === 'correo') {
            const a = s.address || {};
            parts.push(
                `<p style="margin:0 0 4px 0;"><strong>Dirección:</strong> ${escapeHtmlAttr(a.street || '')}</p>`,
                `<p style="margin:0 0 4px 0;"><strong>Ciudad:</strong> ${escapeHtmlAttr(a.city || '')} · <strong>Provincia:</strong> ${escapeHtmlAttr(a.province || '')}</p>`,
                `<p style="margin:0 0 8px 0;"><strong>Código postal:</strong> ${escapeHtmlAttr(a.postalCode || '')}</p>`,
                `<p style="margin:0 0 12px 0;color:#bdbdbd;font-size:13px;">El costo de envío se coordina por WhatsApp después de la compra.</p>`
            );
        } else if (legacyMethod === 'cadete') {
            parts.push(
                `<p style="margin:0 0 12px 0;color:#bdbdbd;font-size:13px;">Coordinamos la entrega por WhatsApp (Córdoba Capital).</p>`
            );
        } else if (legacyMethod === 'coordinar' && s.notes) {
            parts.push(`<p style="margin:0 0 12px 0;"><strong>Tu indicación:</strong> ${escapeHtmlAttr(s.notes)}</p>`);
        }
        return parts.join('');
    }

    const c = orderData.customer || {};
    return `
        <p style="margin:0 0 8px 0;"><strong>Dirección de envío:</strong> ${escapeHtmlAttr(c.address || 'Sin dirección')}</p>
        <p style="margin:0 0 12px 0;"><strong>Código postal:</strong> ${escapeHtmlAttr(c.postalCode || 'Sin código postal')}</p>
    `;
}

/** Bloque HTML de envío para el admin. */
export function formatShippingBlockAdminHtml(orderData) {
    const s = orderData.shipping;
    const type = resolveShippingType(s);
    if (type) {
        const label = escapeHtmlAttr(SHIPPING_TYPE_DISPLAY[type]);
        return `<p style="margin:0 0 12px 0;"><strong>Envío:</strong> ${label}</p>`;
    }

    const legacyMethod = resolveLegacyShippingMethod(s);
    if (legacyMethod) {
        const label = escapeHtmlAttr(SHIPPING_METHOD_LABELS[legacyMethod]);
        const parts = [`<p style="margin:0 0 8px 0;"><strong>Método de envío:</strong> ${label}</p>`];
        if (legacyMethod === 'andreani' || legacyMethod === 'correo') {
            const a = s.address || {};
            parts.push(
                `<p style="margin:0 0 4px 0;"><strong>Calle y número:</strong> ${escapeHtmlAttr(a.street || '')}</p>`,
                `<p style="margin:0 0 4px 0;"><strong>Ciudad:</strong> ${escapeHtmlAttr(a.city || '')}</p>`,
                `<p style="margin:0 0 4px 0;"><strong>Provincia:</strong> ${escapeHtmlAttr(a.province || '')}</p>`,
                `<p style="margin:0 0 8px 0;"><strong>Código postal:</strong> ${escapeHtmlAttr(a.postalCode || '')}</p>`
            );
        } else if (legacyMethod === 'cadete') {
            parts.push(`<p style="margin:0 0 8px 0;color:#bdbdbd;">Córdoba Capital — coordinar por WhatsApp.</p>`);
        }
        if (s.notes) {
            parts.push(`<p style="margin:0 0 12px 0;"><strong>Nota / indicación:</strong> ${escapeHtmlAttr(s.notes)}</p>`);
        } else {
            parts.push('<p style="margin:0 0 12px 0;"></p>');
        }
        return parts.join('');
    }

    const c = orderData.customer || {};
    return `
        <p style="margin:0 0 8px 0;"><strong>Dirección:</strong> ${escapeHtmlAttr(c.address || '-')}</p>
        <p style="margin:0 0 12px 0;"><strong>Código postal:</strong> ${escapeHtmlAttr(c.postalCode || '-')}</p>
    `;
}

/** Bloque ENVÍO en texto plano para CallMeBot. */
export function formatShippingWhatsAppBlock(orderData) {
    const s = orderData.shipping;
    const type = resolveShippingType(s);
    if (type) {
        return `ENVÍO: ${SHIPPING_TYPE_DISPLAY[type]}`;
    }

    const legacyMethod = resolveLegacyShippingMethod(s);
    if (legacyMethod) {
        const label = SHIPPING_METHOD_LABELS[legacyMethod];
        const lines = [`ENVÍO: ${label}`];
        if (legacyMethod === 'andreani' || legacyMethod === 'correo') {
            const a = s.address || {};
            lines.push(
                `Dirección: ${plainText(a.street) || '—'}, ${plainText(a.city) || '—'}, ${plainText(a.province) || '—'} CP:${plainText(a.postalCode) || '—'}`
            );
        } else if (legacyMethod === 'cadete') {
            lines.push('Coordinar por WhatsApp');
        } else if (legacyMethod === 'coordinar') {
            lines.push(`Nota: ${plainText(s.notes) || '—'}`);
        }
        return lines.join('\n');
    }

    const c = orderData.customer || {};
    return [
        'ENVÍO: (pedido anterior)',
        `Dirección: ${plainText(c.address) || '—'}`,
        `CP: ${plainText(c.postalCode) || '—'}`
    ].join('\n');
}
