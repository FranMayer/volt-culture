/**
 * Tests estáticos del flujo de transferencia bancaria.
 * No hace llamadas de red — verifica el contrato y los símbolos clave en el código.
 *
 * Uso: node tests/transfer-flow.test.js
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assert(label, cond) {
    if (!cond) throw new Error(`FAIL — ${label}`);
}

function assertIncludes(label, haystack, needle) {
    if (!haystack.includes(needle)) {
        throw new Error(`FAIL — ${label}: missing "${needle}"`);
    }
}

function assertExcludes(label, haystack, needle) {
    if (haystack.includes(needle)) {
        throw new Error(`FAIL — ${label}: should not include "${needle}"`);
    }
}

// ──────────────────────────────────────────────────────────────
// 1) Endpoint create-transfer-order.js — contrato y validaciones
// ──────────────────────────────────────────────────────────────
const endpointPath = 'api/create-transfer-order.js';
assert(`${endpointPath} debe existir`, fs.existsSync(path.join(root, endpointPath)));
const endpoint = read(endpointPath);

assertIncludes('endpoint usa rate-limit', endpoint, "applyRateLimit(req, res, 'create-preference')");
assertIncludes('endpoint usa validación CORS estricta', endpoint, 'ALLOWED_ORIGINS');
assertIncludes('endpoint valida stock server-side', endpoint, 'computeAvailableStock');
assertIncludes('endpoint usa transacción Firestore', endpoint, 'runTransaction');
assertIncludes('endpoint setea status pending_transfer', endpoint, "status: 'pending_transfer'");
assertIncludes('endpoint setea paymentMethod transfer', endpoint, "paymentMethod: 'transfer'");
assertIncludes('endpoint marca inventoryAdjusted false', endpoint, 'inventoryAdjusted: false');
assertIncludes('endpoint aplica descuento 10%', endpoint, 'TRANSFER_DISCOUNT_RATE = 0.10');
assertIncludes('endpoint devuelve orderId', endpoint, 'orderId,');
assertIncludes('endpoint persiste discountAmount', endpoint, 'discountAmount,');
assertExcludes('endpoint NO debe envolver Mercado Pago', endpoint, 'mercadopago');
assertExcludes('endpoint NO debe envolver Mercado Pago (Preference)', endpoint, 'Preference');
assertExcludes('endpoint NO debe usar Resend en creación', endpoint, 'resend.emails.send');

// ──────────────────────────────────────────────────────────────
// 2) notify-status.js — descuento de stock + email cliente
// ──────────────────────────────────────────────────────────────
const notify = read('api/notify-status.js');
assertIncludes('notify-status usa applyStockDecrement', notify, 'applyStockDecrement');
assertIncludes('notify-status tiene transición idempotente', notify, 'applyAdminPaidTransition');
assertIncludes('notify-status setea inventoryAdjusted true', notify, 'inventoryAdjusted: true');
assertIncludes('notify-status escapa caso ya descontado', notify, 'o.inventoryAdjusted === true');
assertIncludes('notify-status mensaje específico transferencia', notify, "paymentMethod === 'transfer'");
assertIncludes('notify-status persiste paidAt', notify, 'paidAt: FieldValue.serverTimestamp()');

// ──────────────────────────────────────────────────────────────
// 3) pagos.js — flujo transfer pasa por backend antes de WhatsApp
// ──────────────────────────────────────────────────────────────
const pagos = read('js/pagos.js');
assertIncludes('pagos define TRANSFER_API_URL', pagos, 'TRANSFER_API_URL = "/api/create-transfer-order"');
assertIncludes('pagos llama al endpoint de transferencia', pagos, 'fetch(TRANSFER_API_URL');
assertIncludes('pagos guarda orderId tras crear', pagos, 'volt_current_order');
assertIncludes('pagos limpia carrito tras crear orden transferencia', pagos, 'VoltCartSync');
assertIncludes('pagos arma WA con orderId del server', pagos, 'orderId: data.orderId');
assertIncludes('pagos incluye orderId en mensaje WhatsApp', pagos, 'Orden #${orderId}');
// El modal ya no debe abrir WhatsApp directamente; lo hace el handler de afuera.
const onPayBlock = pagos.split('const onPay = () => {')[1]?.split('};')[0] || '';
assertExcludes('onPay del modal no debe abrir window.open con wa.me', onPayBlock, 'window.open');

// ──────────────────────────────────────────────────────────────
// 4) Admin: estado pending_transfer reconocido
// ──────────────────────────────────────────────────────────────
const adminJs = read('js/admin-orders.js');
assertIncludes('admin reconoce status pending_transfer', adminJs, "pending_transfer: 'status-pending-transfer'");
assertIncludes('admin tiene label pending_transfer', adminJs, "pending_transfer: 'Pendiente transferencia'");
assertIncludes('admin cuenta pending_transfer como pendiente', adminJs, "o.status === 'pending_transfer'");
assertIncludes('admin muestra hint visual de transferencia pendiente', adminJs, 'Esperando comprobante de transferencia');

const adminHtml = read('admin/panel.html');
assertIncludes('admin filtro UI tiene opción pending_transfer', adminHtml, '<option value="pending_transfer">');
assertIncludes('admin CSS define badge pending_transfer', adminHtml, '.status-pending-transfer');

// ──────────────────────────────────────────────────────────────
// 5) Cliente — mis-pedidos.html
// ──────────────────────────────────────────────────────────────
const misPedidos = read('pages/mis-pedidos.html');
assertIncludes('mis-pedidos define label Esperando transferencia', misPedidos, "pending_transfer: 'Esperando transferencia'");
assertIncludes('mis-pedidos define badge CSS pending_transfer', misPedidos, '.order-badge--pending_transfer');

const ds = read('css/volt-ds.css');
assertIncludes('volt-ds incluye pending_transfer en agrupación pendiente', ds, '.order-badge--pending_transfer');

console.log('✅ transfer-flow checks passed');
