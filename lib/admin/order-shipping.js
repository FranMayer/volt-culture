/**
 * lib/admin/order-shipping.js — helpers puros para mostrar los datos de envío
 * de una orden en el detalle admin. Port de adminShippingHtml()/
 * adminShippingPlain() (legacy/js/admin-orders.js) + needsAndreaniAddress()
 * (legacy/js/admin-despachos.js, misma lógica ahí como needsDespacho()).
 *
 * Desvío deliberado: legacy interpolaba `shipping.address.{street,city,...}`
 * sin escapar dentro de un template HTML (innerHTML) — esos campos vienen del
 * formulario de checkout, o sea texto tipeado por el cliente, así que un
 * comprador podía inyectar markup que se ejecutaba en el navegador del admin
 * al abrir el detalle de su propia orden. Acá esta función devuelve texto
 * plano estructurado; components/admin/OrderDetailModal.tsx lo renderiza
 * como JSX (auto-escapado por React) en vez de HTML crudo.
 */

const SHIPPING_LABELS = {
    cadete: 'Cadete en moto (Córdoba Capital)',
    cordoba: 'Envío Córdoba Capital (circunvalación)',
    andreani: 'Andreani / Interior',
    correo: 'Correo Argentino',
    coordinar: 'Coordinar entrega',
};

/** true si el método de envío requiere dirección postal completa (Andreani/Correo). */
export function needsAddressShipping(shipping) {
    return shipping?.type === 'andreani' || shipping?.method === 'andreani' || shipping?.method === 'correo';
}

function andreaniTrackUrl(trackingNumber) {
    return `https://www.andreani.com/#!/informacionEnvio/${encodeURIComponent(trackingNumber)}`;
}

/**
 * @typedef {{ label?: string, text: string, trackingUrl?: string, muted?: boolean }} ShippingLine
 */

/**
 * Líneas estructuradas de envío para una orden, en el mismo orden/condición
 * que adminShippingHtml.
 * @returns {ShippingLine[]}
 */
export function buildShippingLines(order) {
    const s = order?.shipping || {};
    const shipKey = s.method || s.type;

    if (shipKey) {
        const needsAddress = needsAddressShipping(s);
        const lines = [{ label: 'Envío', text: SHIPPING_LABELS[shipKey] || shipKey }];
        if (s.cost != null && shipKey === 'cordoba') {
            lines.push({ label: 'Costo envío', text: `$${Number(s.cost).toLocaleString('es-AR')}` });
        }
        if (s.note) lines.push({ label: 'Nota', text: s.note });
        if (needsAddress) {
            const a = s.address || {};
            lines.push({ label: 'Dirección', text: a.street || '-' });
            lines.push({ text: `${a.city || '-'}, ${a.province || '-'} — CP ${a.postalCode || '-'}` });
        } else if (s.type === 'cordoba') {
            lines.push({ text: 'Entrega local — coordinar por WhatsApp', muted: true });
        } else if (s.method === 'cadete') {
            lines.push({ text: 'Coordinar entrega por WhatsApp', muted: true });
        }
        if (s.notes) lines.push({ label: 'Nota', text: s.notes });
        if (needsAddress && s.trackingNumber) {
            lines.push({
                label: `Tracking ${s.carrier || 'Andreani'}`,
                text: s.trackingNumber,
                trackingUrl: andreaniTrackUrl(s.trackingNumber),
            });
        }
        return lines;
    }

    // Pedidos legados sin shipping.type/method: dirección plana en customer.address.
    if (needsAddressShipping(s) && s.trackingNumber) {
        return [{
            label: 'Tracking Andreani',
            text: s.trackingNumber,
            trackingUrl: andreaniTrackUrl(s.trackingNumber),
        }];
    }
    return [{ label: 'Dirección', text: order?.customer?.address || '-' }];
}

/** Texto plano (para copiar al portapapeles) equivalente a buildShippingLines. */
export function shippingPlainText(order) {
    return buildShippingLines(order)
        .map((line) => {
            const base = line.label ? `${line.label}: ${line.text}` : line.text;
            return line.trackingUrl ? `${base}\n${line.trackingUrl}` : base;
        })
        .join('\n');
}
