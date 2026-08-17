/**
 * lib/brain/engine.js — motor de VOLT Brain. Port de Volt-dashboard
 * (src/logic/engine.js), JS puro: sin React, sin Firestore, sin imports.
 *
 * La decisión que sostiene todo: **los eventos son la única fuente de verdad.**
 * No se guarda `capital`, ni totales, ni métricas del mes — derivarEstado()
 * recorre la lista y suma. De ahí salen tres cosas gratis:
 *   - borrar un evento revierte su impacto exacto (no hay lógica de "deshacer"),
 *   - las métricas del mes son del mes (se filtran por fecha, no se acumulan en
 *     un contador que nunca se resetea — ese era el bug original),
 *   - importar/mergear no rompe nada.
 *
 * Desvíos respecto del original:
 *   - fmt/fmtARS inlineados (venían de src/data/initialState.js, que no se porta).
 *   - crearEvento() NO genera id: en Firestore el id lo pone addDoc(). Y acepta
 *     `fecha` (YYYY-MM-DD) para poder cargar algo de un mes pasado sin
 *     desvirtuar el balance mensual.
 *   - eventoDesdeOrden(): nuevo. Convierte una orden pagada de la tienda en un
 *     evento de venta, para no tipear a mano lo que el panel ya sabe.
 *   - mergearEventos() eliminado: con doc id explícito, "mergear" es un setDoc.
 */

export const fmt = (n) =>
    new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);

export const fmtARS = (n) => `${n < 0 ? '-' : ''}$${fmt(Math.abs(n))}`;

/** Estados de `orders` que cuentan como plata efectivamente entrada. */
export const ESTADOS_PAGADOS = ['paid', 'shipped', 'delivered'];

/** Prefijo del doc id de un evento importado desde una orden. El prefijo ES la
 *  marca de origen: evita un campo extra y hace el import idempotente (mismo
 *  id ⇒ setDoc pisa en vez de duplicar). */
export const PREFIJO_ORDEN = 'order_';

export const esDeOrden = (id) => typeof id === 'string' && id.startsWith(PREFIJO_ORDEN);

/** Doc id del evento gemelo de una orden. Lo usan el import de BrainTab y el
 *  borrado de pedidos (pages/api/admin-cleanup.js): si la regla vive en dos
 *  lados y una cambia, borrar una orden deja el evento huérfano y el balance
 *  cuenta una venta que ya no existe. */
export const idEventoDeOrden = (orden, docId) =>
    `${PREFIJO_ORDEN}${orden?.orderId || docId}`;

/** 'YYYY-MM-DD' → epoch ms al mediodía local. Mediodía y no medianoche para que
 *  el offset horario no corra el evento al día anterior. Sin fecha → ahora. */
function timestampDesdeFecha(fecha) {
    if (!fecha) return Date.now();
    const t = new Date(`${fecha}T12:00:00`).getTime();
    return Number.isNaN(t) ? Date.now() : t;
}

// Un evento es el único dato que se guarda:
//   { timestamp, tipo, detalle, deltaCapital }  (+ id = doc id de Firestore)
export function crearEvento(tipo, datos) {
    const base = { timestamp: timestampDesdeFecha(datos.fecha), tipo, deltaCapital: 0 };

    if (tipo === 'venta') {
        return {
            ...base,
            detalle: `${datos.descripcion} (${datos.medioPago})`,
            deltaCapital: Number(datos.monto),
        };
    }

    if (tipo === 'gasto') {
        return {
            ...base,
            detalle: `${datos.categoria}: ${datos.descripcion}`,
            deltaCapital: -Number(datos.monto),
        };
    }

    if (tipo === 'marketing') {
        const inversion = Number(datos.inversion) || 0;
        return {
            ...base,
            detalle: `${datos.tipo}: ${datos.descripcion}${datos.alcance ? ` (alcance ~${datos.alcance})` : ''}`,
            deltaCapital: -inversion,
        };
    }

    throw new Error(`Tipo de evento desconocido: ${tipo}`);
}

/**
 * Orden pagada de la tienda → evento de venta. `orden.timestamp` ya viene en ms
 * (el Timestamp de Firestore se convierte con .toMillis() antes de llamar acá:
 * el motor hace `new Date(ev.timestamp)` y no quiero dos representaciones).
 */
export function eventoDesdeOrden(orden) {
    const unidades = (orden.items || []).reduce((n, i) => n + (Number(i.quantity) || 1), 0);
    return {
        timestamp: orden.timestamp,
        tipo: 'venta',
        detalle: `${orden.orderId} — ${unidades} ${unidades === 1 ? 'item' : 'items'} (${orden.paymentMethod || 'mercadopago'})`,
        deltaCapital: Number(orden.total) || 0,
    };
}

const mismoMes = (a, b) =>
    a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

// Todo lo que se deriva es una suma, así que el orden de los eventos no importa.
export function derivarEstado(eventos, ahora = new Date()) {
    const est = {
        capital: 0,
        // acumulados de toda la historia — el pantallazo de cuánto entró y cuánto salió
        totalVendido: 0,
        totalGastado: 0,
        ventas: 0,
        ventasMes: 0,
        ingresosMes: 0,
        egresosMes: 0,
    };

    for (const ev of eventos) {
        const delta = ev.deltaCapital ?? 0;
        est.capital += delta;
        if (delta > 0) est.totalVendido += delta;
        if (delta < 0) est.totalGastado -= delta;
        if (ev.tipo === 'venta') est.ventas += 1;

        if (mismoMes(new Date(ev.timestamp), ahora)) {
            if (ev.tipo === 'venta') est.ventasMes += 1;
            if (delta > 0) est.ingresosMes += delta;
            if (delta < 0) est.egresosMes -= delta;
        }
    }

    return est;
}

const esEvento = (e) =>
    e !== null &&
    typeof e === 'object' &&
    typeof e.timestamp === 'number' &&
    typeof e.tipo === 'string' &&
    typeof e.detalle === 'string' &&
    typeof e.deltaCapital === 'number';

// Un backup es un array de eventos y nada más. Se valida entero antes de tocar
// el estado: mejor rechazar el archivo que mezclar basura con los datos reales.
export const esBackupValido = (datos) => Array.isArray(datos) && datos.every(esEvento);

export function calcularModo(state) {
    const { capital, ventasMes, ingresosMes, egresosMes } = state;

    // ponytail: capital <= 0 es el umbral de AHORRO. Si querés un colchón mínimo
    // (ej. no salir de AHORRO hasta tener $200.000), ese es el número a cambiar.
    let modo = 'NEUTRO';
    if (capital <= 0 || egresosMes > ingresosMes) {
        modo = 'AHORRO';
    } else if (ingresosMes > egresosMes * 2) {
        modo = 'CRECIMIENTO';
    }

    const recomendaciones = [];

    if (modo === 'AHORRO') {
        recomendaciones.push('Producir solo contra pedido confirmado');
        recomendaciones.push('No comprometer plata en tandas grandes todavía');
        if (ventasMes < 3) {
            recomendaciones.push('Activar contenido orgánico en Instagram antes de invertir en ads');
        }
        if (capital < 0) {
            recomendaciones.push(`Faltan ${fmtARS(-capital)} para recuperar lo invertido`);
        }
    } else if (modo === 'CRECIMIENTO') {
        recomendaciones.push('Capital positivo y ventas al doble de los gastos — evaluar nueva línea de producto');
        recomendaciones.push('Considerar escalar presupuesto de ads');
        recomendaciones.push('Con margen sostenido, evaluar producir una tanda por adelantado');
    } else {
        recomendaciones.push('Mantener ritmo actual de producción');
        recomendaciones.push('Registrar más eventos para obtener recomendaciones precisas');
    }

    return { modo, recomendaciones };
}
