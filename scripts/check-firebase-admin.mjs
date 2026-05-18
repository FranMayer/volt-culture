/**
 * Verifica credenciales Firebase Admin (sin imprimir secretos).
 * Uso: node scripts/check-firebase-admin.mjs
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

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
        console.log('WARN: .env.local no encontrado');
    }
}

loadEnvFile(resolve(process.cwd(), '.env.local'));

const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim();
const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();

console.log('projectId:', projectId || 'MISSING');
console.log('clientEmail:', clientEmail ? 'SET' : 'MISSING');
console.log('privateKey:', privateKey && privateKey.includes('BEGIN') ? 'SET' : 'MISSING');

if (!projectId || !clientEmail || !privateKey) process.exit(2);

if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

const auth = getAuth();
const ADMIN_EMAIL = 'volt.streetcba@gmail.com';

try {
    const user = await auth.getUserByEmail(ADMIN_EMAIL);
    const claims = user.customClaims || {};
    console.log('admin_user_found: true');
    console.log('uid:', user.uid);
    console.log('admin_claim:', !!claims.admin);
    console.log('providers:', user.providerData.map(p => p.providerId).join(', '));
} catch (err) {
    console.log('error_code:', err.code || 'unknown');
    console.log('error_message:', err.message);
    process.exit(1);
}
