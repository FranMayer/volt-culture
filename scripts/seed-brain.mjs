/**
 * seed-brain.mjs — carga el historial de VOLT Brain en Firestore (`brain_eventos`).
 *
 * USO:
 *   node scripts/seed-brain.mjs volt-brain-backup.json      # el JSON de "Respaldar"
 *   node scripts/seed-brain.mjs --historico                 # solo los 7 eventos del código viejo
 *   node scripts/seed-brain.mjs volt-brain-backup.json --dry # ver qué haría, sin escribir
 *
 * Script de un solo uso: una vez que los datos están en Firestore se puede borrar.
 * Es idempotente — usa el id del evento como doc id, así que correrlo dos veces
 * deja los mismos documentos, no el doble.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { esBackupValido, fmtARS, derivarEstado } from '../lib/brain/engine.js';

// ── Cargar variables desde .env.local (mismo parser que set-admin.mjs) ─────
function loadEnvFile(filepath) {
    try {
        const lines = readFileSync(filepath, 'utf8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) continue;
            const key = trimmed.slice(0, eqIdx).trim();
            let raw = trimmed.slice(eqIdx + 1).trim();
            let val;
            if (raw.startsWith('"') && raw.endsWith('"')) {
                try { val = JSON.parse(raw); } catch { val = raw.slice(1, -1).replace(/\\n/g, '\n'); }
            } else if (raw.startsWith("'") && raw.endsWith("'")) {
                val = raw.slice(1, -1);
            } else {
                val = raw;
            }
            if (key && !(key in process.env)) process.env[key] = val;
        }
    } catch {
        // .env.local no existe — se usan las vars de entorno del sistema
    }
}

loadEnvFile(resolve(process.cwd(), '.env.local'));

// ── Historial base (Volt-dashboard/src/data/initialState.js) ───────────────
// OJO: son 7 de los 9 eventos reales. Los otros 2 (estampadora $666.900 y PNG
// diseños $16.000, 16/08/2026) vivían solo en el localStorage del navegador y
// únicamente están en el JSON de "Respaldar". Por eso el modo por defecto es
// el archivo, y --historico es el plan B.
const ts = (dia, mes, anio) => new Date(anio, mes - 1, dia, 12).getTime();

const EVENTOS_HISTORICOS = [
    { id: 'h7', timestamp: ts(28, 5, 2026), tipo: 'gasto', detalle: 'Insumos: Bolsas camiseta 50x70', deltaCapital: -9843.08 },
    { id: 'h6', timestamp: ts(27, 5, 2026), tipo: 'gasto', detalle: 'Marketing: Stickers pago completo', deltaCapital: -6365.91 },
    { id: 'h5', timestamp: ts(27, 1, 2025), tipo: 'venta', detalle: 'Venta de 1 Buzo Colapinto (Transferencia) — Aye', deltaCapital: 48000 },
    { id: 'h4', timestamp: ts(27, 1, 2025), tipo: 'gasto', detalle: 'Producción: Pedido 4 buzos F1', deltaCapital: -162000 },
    { id: 'h3', timestamp: ts(31, 5, 2024), tipo: 'gasto', detalle: 'Producción: Segundo pago Remeras + Buzos TC', deltaCapital: -318500 },
    { id: 'h2', timestamp: ts(1, 2, 2024), tipo: 'gasto', detalle: 'Producción: Seña Remeras + Buzos', deltaCapital: -318550 },
    { id: 'h1', timestamp: ts(31, 1, 2024), tipo: 'gasto', detalle: 'Marketing: Seña Plancha Stickers', deltaCapital: -6395.91 },
];

// ── Elegir la fuente ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const archivo = args.find((a) => !a.startsWith('--'));

let eventos;
if (archivo) {
    let json;
    try {
        json = JSON.parse(readFileSync(resolve(process.cwd(), archivo), 'utf8'));
    } catch (err) {
        console.error(`❌ No se pudo leer ${archivo}: ${err.message}`);
        process.exit(1);
    }
    // Se valida el archivo entero antes de tocar nada: mejor rechazarlo que
    // mezclar basura con los números reales.
    if (!esBackupValido(json)) {
        console.error('❌ El archivo no es un backup válido (array de {id, timestamp, tipo, detalle, deltaCapital}).');
        process.exit(1);
    }
    eventos = json;
} else if (args.includes('--historico')) {
    eventos = EVENTOS_HISTORICOS;
    console.warn('⚠️  Modo --historico: son 7 de los 9 eventos. Faltan los 2 del 16/08/2026 que solo están en el backup del navegador.');
} else {
    console.error('Uso: node scripts/seed-brain.mjs <backup.json> [--dry]');
    console.error('     node scripts/seed-brain.mjs --historico [--dry]');
    process.exit(1);
}

const est = derivarEstado(eventos, new Date());
console.log(`\n${eventos.length} eventos · capital ${fmtARS(est.capital)} · invertido ${fmtARS(est.totalGastado)} · vendido ${fmtARS(est.totalVendido)} (${est.ventas} ventas)\n`);

if (dry) {
    for (const ev of eventos) {
        console.log(`  ${new Date(ev.timestamp).toLocaleDateString('es-AR')}  ${ev.tipo.padEnd(9)} ${fmtARS(ev.deltaCapital).padStart(12)}  ${ev.detalle}`);
    }
    console.log('\n(--dry: no se escribió nada)');
    process.exit(0);
}

// ── Escribir ───────────────────────────────────────────────────────────────
const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim();
const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();

if (!projectId || !clientEmail || !privateKey) {
    console.error('❌ Faltan FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
    process.exit(1);
}

if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

const db = getFirestore();
const batch = db.batch();

for (const ev of eventos) {
    const { id, ...datos } = ev;
    // doc id = id del evento ⇒ re-correr el script pisa, no duplica.
    batch.set(db.collection('brain_eventos').doc(id), datos);
}

await batch.commit();
console.log(`✅ ${eventos.length} eventos escritos en brain_eventos.`);
console.log('   → Abrí /admin → solapa Brain para verlos.');
process.exit(0);
