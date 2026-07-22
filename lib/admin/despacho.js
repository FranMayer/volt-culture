/**
 * lib/admin/despacho.js — helpers puros para armar la orden de envío
 * Andreani desde una orden VOLT. Port literal de legacy/js/admin-despachos.js
 * (splitStreet/bultoUnitFor/buildBulto) — sin red, testeable con `node`
 * plano (ver tests/admin-despacho.test.mjs).
 */

// ponytail: separa "calle" y "numero" de un string tipo "Av. Colón 1234" —
// cubre el caso típico (calle + numero al final); direcciones sin numero al
// final quedan como 'S/N'.
export function splitStreet(street) {
    const s = String(street || '').trim();
    const m = s.match(/^(.*?)[,\s]+(\d+\s*\S*)\s*$/);
    return {
        calle: m ? m[1].trim() : s,
        numero: m ? m[2].trim() : 'S/N',
    };
}

export function bultoUnitFor(title) {
    return /hoodie|buzo/i.test(title || '')
        ? { kilos: 0.7, volumenCm3: 6000 }
        : { kilos: 0.3, volumenCm3: 3000 };
}

export function buildBulto(order) {
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
        valorDeclarado: order.total || 0,
    };
}

/**
 * Guard de idempotencia del lado cliente: si la orden ya tiene un envío
 * Andreani generado, la fila muestra "Ver etiqueta" en vez de "Generar orden"
 * — no hay botón que dispare un segundo POST. El endpoint
 * (pages/api/crear-orden-andreani.js) es idempotente igual (devuelve el
 * numeroDeEnvio ya persistido si existe), esto solo evita el request de más.
 */
export function hasAndreaniShipment(order) {
    return Boolean(order?.shipping?.andreani?.numeroDeEnvio);
}
