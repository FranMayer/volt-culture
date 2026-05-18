/**
 * Lista productos desde Firestore (Admin SDK).
 * Uso: node scripts/list-products.mjs
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
            } else {
                val = raw;
            }
            if (key && !(key in process.env)) process.env[key] = val;
        }
    } catch { /* ignore */ }
}

loadEnvFile(resolve(process.cwd(), '.env.local'));

const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim();
const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();

if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

const db = getFirestore();
const snap = await db.collection('products').get();
console.log('Total productos:', snap.size);

let invalid = 0;
snap.forEach((doc) => {
    try {
        const data = doc.data();
        JSON.stringify(data);
        console.log('-', doc.id, '|', data.name || '(sin nombre)', '| active:', data.active);
        if (process.argv.includes('--verbose')) {
            console.log(JSON.stringify(data, null, 2));
        }
    } catch (e) {
        invalid++;
        console.log('-', doc.id, '| ERROR serializando:', e.message);
    }
});

const ordersSnap = await db.collection('orders').limit(3).get();
console.log('\nPedidos (muestra):', ordersSnap.size);

if (invalid) console.log('\nDocumentos con posible dato corrupto:', invalid);
