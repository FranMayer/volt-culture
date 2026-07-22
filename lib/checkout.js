/**
 * lib/checkout.js — helpers puros portados de legacy/js/pagos.js (sin DOM,
 * sin fetch, sin Firestore). .js (no .ts) para que tests/checkout-logic.test.mjs
 * lo importe sin loader TS — mismo criterio que lib/cart/reducer.js /
 * lib/server/coupons.js.
 *
 * `shippingConfig` se recibe por parámetro en vez de importar
 * lib/shipping-config.ts: mantiene este módulo 100% JS plano (Node puede
 * ejecutarlo directo) y de paso evita duplicar los costos de envío — el
 * caller (components/checkout/CheckoutModal.tsx) importa SHIPPING_CONFIG
 * una sola vez y lo pasa acá.
 */
import { isCouponValid } from './server/coupons.js';

const TRANSFER_DISCOUNT = 0.10;

/** legacy pagos.js:85-87 validateDni. */
export function validateDni(dni) {
    return /^\d{7,8}$/.test(String(dni || '').trim());
}

/** legacy pagos.js:457-459 formatMoney. */
export function formatMoney(n) {
    return `$${Number(n || 0).toLocaleString('es-AR')}`;
}

/** legacy pagos.js:374-385 estimateCartShipment (peso/volumen para cotizar Andreani). */
export function estimateCartShipment(cart) {
    let pesoKg = 0;
    let volumenCm3 = 0;
    (cart || []).forEach((item) => {
        const qty = item.quantity || 1;
        const name = item.title || item.name || '';
        const isHoodie = /hoodie|buzo/i.test(name);
        pesoKg += (isHoodie ? 0.7 : 0.3) * qty;
        volumenCm3 += (isHoodie ? 6000 : 3000) * qty;
    });
    return { pesoKg: Math.round(pesoKg * 100) / 100, volumenCm3 };
}

/** legacy pagos.js:325-331 validateAndreaniAddress. */
export function validateAndreaniAddress(address) {
    if (!address?.street) return 'Completá calle y número.';
    if (!address?.city) return 'Completá ciudad.';
    if (!address?.province) return 'Elegí provincia.';
    if (!address?.postalCode) return 'Completá código postal.';
    return null;
}

/**
 * Mensajes en español de legacy pagos.js#couponValidity (líneas 465-485),
 * mapeados a los `reason` codes de isCouponValid (lib/server/coupons.js).
 */
const COUPON_REASON_MESSAGES = {
    not_found: 'No encontramos ese cupón.',
    inactive: 'Ese cupón no está activo.',
    bad_percent: 'Cupón inválido.',
    expired: 'Ese cupón está vencido.',
    exhausted: 'Ese cupón alcanzó su límite de usos.',
};

export function couponReasonMessage(reason) {
    return COUPON_REASON_MESSAGES[reason] || 'Cupón inválido.';
}

/**
 * Valida un doc de cupón (o null) reusando isCouponValid (server/coupons.js
 * — misma fuente de verdad que los endpoints), traducido a los mensajes de
 * legacy#couponValidity para la UI del checkout.
 */
export function checkCoupon(data, now = new Date()) {
    const res = isCouponValid(data, now);
    if (!res.valid) return { valid: false, reason: couponReasonMessage(res.reason) };
    return { valid: true, percent: Number(data.percent) };
}

/**
 * Totales del resumen (paso 3) — port del cálculo de renderSummary()
 * (legacy pagos.js:487-543), sin el armado de HTML.
 *
 * @param {Array} items
 * @param {'cordoba'|'andreani'} shippingOption
 * @param {{cordoba:{cost:number}, andreani:{cost:number}}} shippingConfig
 * @param {'mp'|'transfer'} mode
 * @param {{code:string, percent:number}|null} coupon
 */
export function computeCheckoutTotals(items, shippingOption, shippingConfig, mode, coupon) {
    const productsTotal = items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
    const shippingCost = shippingOption === 'cordoba' ? shippingConfig.cordoba.cost : shippingConfig.andreani.cost;
    const subtotal = productsTotal + shippingCost;

    let discountAmount = 0;
    if (coupon) {
        const percent = coupon.percent;
        discountAmount = mode === 'transfer'
            ? Math.round(productsTotal * percent / 100)
            : productsTotal - items.reduce((sum, item) =>
                sum + Math.round((item.price || 0) * (100 - percent) / 100) * (item.quantity || 1), 0);
    } else if (mode === 'transfer') {
        discountAmount = Math.round(subtotal * TRANSFER_DISCOUNT);
    }

    const total = subtotal - discountAmount;
    return { productsTotal, shippingCost, subtotal, discountAmount, total };
}

/**
 * Mensaje de WhatsApp para la orden por transferencia — port del texto de
 * buildTransferWaUrl() (legacy pagos.js:574-628); el caller arma la URL
 * wa.me con encodeURIComponent (necesita window, no pertenece acá).
 */
export function buildTransferWaMessage({ items, customer, shippingOption, shippingConfig, address, serverTotals = {} }) {
    const productsTotal = items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
    const shippingCost = shippingOption === 'cordoba' ? shippingConfig.cordoba.cost : 0;
    const localSubtotal = productsTotal + shippingCost;
    const localDiscount = Math.round(localSubtotal * TRANSFER_DISCOUNT);
    const localFinal = localSubtotal - localDiscount;

    const subtotal = Number.isFinite(serverTotals.subtotal) ? serverTotals.subtotal : localSubtotal;
    const discountAmount = Number.isFinite(serverTotals.discountAmount) ? serverTotals.discountAmount : localDiscount;
    const finalTotal = Number.isFinite(serverTotals.total) ? serverTotals.total : localFinal;
    const orderId = serverTotals.orderId ? String(serverTotals.orderId).trim() : '';

    const itemLines = items.map((item) => {
        const bits = [];
        if (item.variantSize) bits.push(`Talle ${item.variantSize}`);
        if (item.variantColor) bits.push(item.variantColor);
        const sub = bits.length ? ` (${bits.join(', ')})` : '';
        return `• ${item.title || 'Producto'}${sub} ×${item.quantity || 1} — ${formatMoney((item.price || 0) * (item.quantity || 1))}`;
    }).join('\n');

    let shipInfo;
    if (shippingOption === 'cordoba') {
        shipInfo = `${shippingConfig.cordoba.label} — ${formatMoney(shippingConfig.cordoba.cost)}`;
    } else {
        const addr = address || {};
        shipInfo = `Andreani/OCA — ${addr.street || ''}, ${addr.city || ''}, ${addr.province || ''} CP ${addr.postalCode || ''}`;
    }

    const header = orderId
        ? `¡Hola VOLT! Confirmo mi pedido por transferencia. *Orden #${orderId}*.`
        : '¡Hola VOLT! Quiero confirmar mi pedido por transferencia.';

    return [
        header,
        '',
        '*PRODUCTOS:*',
        itemLines,
        '',
        `*Envío:* ${shipInfo}`,
        '',
        `*Subtotal:* ${formatMoney(subtotal)}`,
        serverTotals.discountSource === 'coupon'
            ? `*Descuento cupón ${serverTotals.coupon} (${serverTotals.discountPercent}%):* −${formatMoney(discountAmount)}`
            : `*Descuento 10% transferencia:* −${formatMoney(discountAmount)}`,
        `*TOTAL A TRANSFERIR: ${formatMoney(finalTotal)}*`,
        '',
        '*MIS DATOS:*',
        `${customer.name} · DNI ${customer.dni} · ${customer.phone} · ${customer.email}`,
        '',
        'Adjunto el comprobante de transferencia.',
    ].join('\n');
}
