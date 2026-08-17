/**
 * lib/promo2x1.js — regla de la promo 2x1. Puro: sin red, sin Firestore, sin
 * React. .js (no .ts) para que tests/promo2x1.test.mjs lo importe sin loader TS
 * — mismo criterio que lib/server/coupons.js.
 *
 * La regla: de cada par de unidades marcadas `promo2x1`, la más barata es
 * gratis. Las unidades se expanden por cantidad (quantity: 3 son tres
 * unidades), se ordenan de más cara a más barata y se regala una de cada dos.
 *
 * El servidor SIEMPRE recalcula esto desde el precio y el flag de Firestore.
 * Lo que manda el cliente se ignora.
 */

const enPromo = (i) => i?.promo2x1 === true;

/** ¿Hay al menos un item en promo? Decide el bloqueo de cupones. */
export function tienePromo2x1(items) {
    return (items || []).some(enPromo);
}

/**
 * @param {Array<{price:number, quantity:number, promo2x1?:boolean}>} items
 * @returns {{ descuento:number, unidadesGratis:number, unidadesEnPromo:number }}
 */
export function computePromo2x1(items) {
    const unidades = [];
    for (const item of items || []) {
        if (!enPromo(item)) continue;
        const qty = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        for (let n = 0; n < qty; n++) unidades.push(price);
    }

    unidades.sort((a, b) => b - a);

    let descuento = 0;
    let unidadesGratis = 0;
    // De cada par la segunda (la más barata, porque está ordenado desc) es gratis.
    for (let i = 1; i < unidades.length; i += 2) {
        descuento += unidades[i];
        unidadesGratis++;
    }

    return { descuento, unidadesGratis, unidadesEnPromo: unidades.length };
}

/**
 * Reparte el descuento entre las líneas en promo y devuelve los items con
 * `unitPrice`, listos para MercadoPago.
 *
 * MP recibe una línea con unit_price y quantity, y lo que cobra es la suma. No
 * acepta unit_price negativo ni una línea de descuento, así que el 2x1 se
 * expresa bajando los precios unitarios. El reparto es proporcional al total de
 * cada línea; el residuo de redondeo se absorbe en la línea más cara, partiéndola
 * en dos si su cantidad no permite un ajuste exacto.
 *
 * Invariante: sum(unitPrice * quantity) === sum(price * quantity) − descuento.
 */
export function repartirDescuentoEnItems(items, descuento) {
    const lista = items || [];
    if (!descuento) {
        return lista.map((i) => ({ ...i, unitPrice: Number(i.price) || 0 }));
    }

    const promoLines = lista.filter(enPromo);
    const promoTotal = promoLines.reduce((s, i) => s + i.price * i.quantity, 0);
    const objetivoTotal = promoTotal - descuento;

    // Objetivo por línea, proporcional a su peso dentro del total en promo.
    const objetivos = new Map();
    for (const linea of promoLines) {
        const peso = linea.price * linea.quantity;
        objetivos.set(linea, Math.round((peso * objetivoTotal) / promoTotal));
    }

    // El redondeo por línea no suma exacto: el residuo va a la línea más cara.
    const sumaObjetivos = [...objetivos.values()].reduce((s, v) => s + v, 0);
    const residuo = objetivoTotal - sumaObjetivos;
    if (residuo !== 0 && promoLines.length) {
        const masCara = promoLines.reduce((a, b) => (b.price > a.price ? b : a));
        objetivos.set(masCara, objetivos.get(masCara) + residuo);
    }

    const salida = [];
    for (const item of lista) {
        if (!enPromo(item)) {
            salida.push({ ...item, unitPrice: Number(item.price) || 0 });
            continue;
        }

        const objetivo = objetivos.get(item);
        const qty = item.quantity;
        const base = Math.floor(objetivo / qty);
        const resto = objetivo - base * qty;

        if (resto === 0) {
            salida.push({ ...item, unitPrice: base, quantity: qty });
        } else {
            // qty−resto unidades a `base` + resto unidades a `base+1`.
            // Suma: base*(qty−resto) + (base+1)*resto = base*qty + resto = objetivo.
            salida.push({ ...item, unitPrice: base, quantity: qty - resto });
            salida.push({ ...item, unitPrice: base + 1, quantity: resto });
        }
    }

    return salida;
}
