/**
 * Tests unitarios del motor de VOLT Brain. Uso: node tests/brain.test.mjs
 * Port de Volt-dashboard/src/logic/engine.test.js + casos nuevos (fecha manual,
 * eventoDesdeOrden).
 */
import {
    crearEvento,
    eventoDesdeOrden,
    derivarEstado,
    calcularModo,
    esBackupValido,
    esDeOrden,
    fmtARS,
} from '../lib/brain/engine.js';

let failed = 0;
function check(label, cond) {
    if (!cond) { console.error(`FAIL — ${label}`); failed++; }
}

const ts = (dia, mes, anio) => new Date(anio, mes - 1, dia, 12).getTime();
const AHORA = new Date(2026, 7, 16); // agosto 2026

// ── crearEvento ────────────────────────────────────────────────────────────
const venta = crearEvento('venta', { descripcion: '2 remeras TC', monto: '48000', medioPago: 'Transferencia' });
check('venta suma al capital', venta.deltaCapital === 48000);
check('venta arma el detalle', venta.detalle === '2 remeras TC (Transferencia)');
check('venta sin fecha usa ahora', Math.abs(venta.timestamp - Date.now()) < 5000);

const gasto = crearEvento('gasto', { categoria: 'Insumos', descripcion: 'Bolsas', monto: '9843' });
check('gasto resta del capital', gasto.deltaCapital === -9843);
check('gasto arma el detalle', gasto.detalle === 'Insumos: Bolsas');

const mkt = crearEvento('marketing', { tipo: 'Influencer', descripcion: 'Canje', alcance: '5000', inversion: '12000' });
check('marketing resta la inversión', mkt.deltaCapital === -12000);
check('marketing incluye alcance', mkt.detalle === 'Influencer: Canje (alcance ~5000)');
check('marketing sin alcance lo omite',
    crearEvento('marketing', { tipo: 'Promo', descripcion: 'x' }).detalle === 'Promo: x');
check('marketing sin inversión no mueve capital',
    crearEvento('marketing', { tipo: 'Promo', descripcion: 'x' }).deltaCapital === 0);

// fecha manual — el pendiente del dashboard original (todo entraba con Date.now())
const conFecha = crearEvento('gasto', { categoria: 'Producción', descripcion: 'Seña', monto: '1000', fecha: '2026-05-27' });
const d = new Date(conFecha.timestamp);
check('fecha manual respeta el día', d.getDate() === 27);
check('fecha manual respeta el mes', d.getMonth() === 4);
check('fecha manual respeta el año', d.getFullYear() === 2026);
check('fecha inválida cae en ahora',
    Math.abs(crearEvento('gasto', { categoria: 'x', descripcion: 'y', monto: '1', fecha: 'basura' }).timestamp - Date.now()) < 5000);

let tiro = false;
try { crearEvento('cualquiera', {}); } catch { tiro = true; }
check('tipo desconocido tira', tiro);

// ── eventoDesdeOrden ───────────────────────────────────────────────────────
const orden = eventoDesdeOrden({
    orderId: 'VOLT-L4EJVS',
    timestamp: ts(22, 7, 2026),
    total: 55000,
    paymentMethod: 'mercadopago',
    items: [{ quantity: 2 }, { quantity: 1 }],
});
check('orden es una venta', orden.tipo === 'venta');
check('orden suma el total', orden.deltaCapital === 55000);
check('orden suma las unidades', orden.detalle === 'VOLT-L4EJVS — 3 items (mercadopago)');
check('orden de 1 unidad usa singular',
    eventoDesdeOrden({ orderId: 'X', timestamp: 1, total: 1, items: [{ quantity: 1 }] }).detalle === 'X — 1 item (mercadopago)');
check('item sin quantity cuenta 1',
    eventoDesdeOrden({ orderId: 'X', timestamp: 1, total: 1, items: [{}] }).detalle.startsWith('X — 1 item'));
check('orden sin total no rompe', eventoDesdeOrden({ orderId: 'X', timestamp: 1, items: [] }).deltaCapital === 0);

check('esDeOrden reconoce el prefijo', esDeOrden('order_VOLT-L4EJVS') === true);
check('esDeOrden rechaza un id manual', esDeOrden('aB3xY') === false);
check('esDeOrden tolera no-string', esDeOrden(undefined) === false);

// ── derivarEstado ──────────────────────────────────────────────────────────
const eventos = [
    { id: '1', timestamp: ts(2, 8, 2026), tipo: 'venta', detalle: 'a', deltaCapital: 100000 },
    { id: '2', timestamp: ts(5, 8, 2026), tipo: 'gasto', detalle: 'b', deltaCapital: -30000 },
    { id: '3', timestamp: ts(10, 1, 2026), tipo: 'venta', detalle: 'c', deltaCapital: 48000 },
    { id: '4', timestamp: ts(10, 1, 2026), tipo: 'gasto', detalle: 'd', deltaCapital: -162000 },
    { id: '5', timestamp: ts(6, 8, 2026), tipo: 'marketing', detalle: 'e', deltaCapital: 0 },
];
const est = derivarEstado(eventos, AHORA);
check('capital = suma de deltas', est.capital === -44000);
check('totalVendido acumula todo lo positivo', est.totalVendido === 148000);
check('totalGastado acumula todo lo negativo', est.totalGastado === 192000);
check('ventas cuenta las de toda la historia', est.ventas === 2);
check('ventasMes cuenta solo las del mes', est.ventasMes === 1);
check('ingresosMes solo del mes', est.ingresosMes === 100000);
check('egresosMes solo del mes', est.egresosMes === 30000);
// el bug original: egresosMes arrastraba el histórico y dejaba el modo pegado en AHORRO
check('egresosMes NO arrastra el histórico', est.egresosMes !== est.totalGastado);

const vacio = derivarEstado([], AHORA);
check('lista vacía da capital 0', vacio.capital === 0);
check('lista vacía da 0 ventas', vacio.ventas === 0);
check('evento sin deltaCapital no rompe',
    derivarEstado([{ timestamp: ts(2, 8, 2026), tipo: 'venta', detalle: 'x' }], AHORA).capital === 0);
check('mismo mes de otro año NO cuenta',
    derivarEstado([{ timestamp: ts(2, 8, 2025), tipo: 'venta', detalle: 'x', deltaCapital: 500 }], AHORA).ingresosMes === 0);

// ── calcularModo ───────────────────────────────────────────────────────────
const modoDe = (s) => calcularModo({ capital: 0, ventasMes: 0, ingresosMes: 0, egresosMes: 0, ...s }).modo;
check('capital negativo → AHORRO', modoDe({ capital: -1000, ingresosMes: 5000, egresosMes: 100 }) === 'AHORRO');
check('capital 0 → AHORRO', modoDe({ capital: 0, ingresosMes: 5000, egresosMes: 100 }) === 'AHORRO');
check('gasta más de lo que entra → AHORRO', modoDe({ capital: 999999, ingresosMes: 100, egresosMes: 5000 }) === 'AHORRO');
check('ingresos > 2x egresos → CRECIMIENTO', modoDe({ capital: 50000, ingresosMes: 10000, egresosMes: 1000 }) === 'CRECIMIENTO');
check('exactamente 2x NO es CRECIMIENTO', modoDe({ capital: 50000, ingresosMes: 2000, egresosMes: 1000 }) === 'NEUTRO');
check('el resto → NEUTRO', modoDe({ capital: 50000, ingresosMes: 1500, egresosMes: 1000 }) === 'NEUTRO');

const ahorro = calcularModo({ capital: -1456555, ventasMes: 0, ingresosMes: 0, egresosMes: 0 });
check('AHORRO recomienda contra pedido', ahorro.recomendaciones[0] === 'Producir solo contra pedido confirmado');
check('AHORRO con capital negativo dice cuánto falta',
    ahorro.recomendaciones.some((r) => r.includes('Faltan $1.456.555')));
check('AHORRO con pocas ventas sugiere orgánico',
    ahorro.recomendaciones.some((r) => r.includes('orgánico')));
check('AHORRO con 3+ ventas no sugiere orgánico',
    !calcularModo({ capital: -1, ventasMes: 5, ingresosMes: 0, egresosMes: 0 })
        .recomendaciones.some((r) => r.includes('orgánico')));

// ── esBackupValido ─────────────────────────────────────────────────────────
const valido = [{ id: 'h1', timestamp: 1, tipo: 'gasto', detalle: 'x', deltaCapital: -1 }];
check('backup válido pasa', esBackupValido(valido) === true);
check('array vacío es válido', esBackupValido([]) === true);
check('no-array falla', esBackupValido({ eventos: valido }) === false);
check('null falla', esBackupValido(null) === false);
check('timestamp string falla', esBackupValido([{ ...valido[0], timestamp: '1' }]) === false);
check('sin deltaCapital falla', esBackupValido([{ id: 'x', timestamp: 1, tipo: 'g', detalle: 'x' }]) === false);
check('con un elemento basura falla', esBackupValido([...valido, null]) === false);

// ── formato ────────────────────────────────────────────────────────────────
check('fmtARS positivo', fmtARS(48000) === '$48.000');
check('fmtARS negativo mete el signo antes del $', fmtARS(-1456555) === '-$1.456.555');
check('fmtARS redondea', fmtARS(9843.08) === '$9.843');
check('fmtARS de 0', fmtARS(0) === '$0');

if (failed) {
    console.error(`\n${failed} test(s) fallaron`);
    process.exit(1);
}
console.log('brain: todos los tests OK');
