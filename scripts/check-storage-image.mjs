/**
 * Verifica si un archivo existe en Firebase Storage y si la URL pública responde.
 * Uso: node scripts/check-storage-image.mjs "Gorra Hamilton.jpg"
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

function loadEnvFile(filepath) {
    try {
        for (const line of readFileSync(filepath, 'utf8').split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) continue;
            const key = trimmed.slice(0, eqIdx).trim();
            let raw = trimmed.slice(eqIdx + 1).trim();
            let val;
            if (raw.startsWith('"') && raw.endsWith('"')) {
                try { val = JSON.parse(raw); } catch { val = raw.slice(1, -1).replace(/\\n/g, '\n'); }
            } else val = raw;
            if (key && !(key in process.env)) process.env[key] = val;
        }
    } catch { /* ignore */ }
}

loadEnvFile(resolve(process.cwd(), '.env.local'));

const fileName = process.argv[2] || 'Gorra Hamilton.jpg';
const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim();
const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();

if (!getApps().length) {
    initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
        storageBucket: 'volt-store-65157.firebasestorage.app'
    });
}

const bucket = getStorage().bucket();
const file = bucket.file(fileName);

const [exists] = await file.exists();
console.log('Archivo en bucket:', fileName, '→', exists ? 'SÍ existe' : 'NO existe');

if (exists) {
    const [meta] = await file.getMetadata();
    console.log('Tamaño:', meta.size, 'bytes | Tipo:', meta.contentType);
    try {
        const [signed] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 5 * 60 * 1000 });
        const res = await fetch(signed, { method: 'HEAD' });
        console.log('URL firmada (Admin):', res.status, res.statusText);
    } catch (e) {
        console.log('No se pudo firmar URL:', e.message);
    }
}

const publicUrl = 'https://firebasestorage.googleapis.com/v0/b/volt-store-65157.firebasestorage.app/o/Gorra%20Hamilton.jpg?alt=media&token=399a81a4-a2f2-41d9-91c4-897572149802';
const pub = await fetch(publicUrl, { method: 'HEAD' });
console.log('URL pública guardada en DB:', pub.status, pub.statusText);
if (pub.status === 402) {
    console.log('\n→ 402 = Firebase Storage requiere plan Blaze con facturación activa.');
    console.log('  La URL en Firestore es correcta, pero Google no entrega el archivo.');
}
