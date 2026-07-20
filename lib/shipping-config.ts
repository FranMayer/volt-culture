/**
 * Fuente única de verdad — costos y etiquetas de envío (checkout + API).
 * Port literal de legacy/js/shipping-config.js; dependencia de lib/server/shipping-email.
 * Reutilizado tal cual por el checkout (F7).
 */
export const SHIPPING_CONFIG = {
    cordoba: {
        label: 'Córdoba Capital',
        cost: 2500,
        note: null as string | null
    },
    andreani: {
        label: 'Andreani / Interior',
        cost: 0,
        note: 'A coordinar'
    }
};
