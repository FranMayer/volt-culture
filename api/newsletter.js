import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { applyRateLimit } from './_rate-limit.js';

function initAdmin() {
    const projectId   = (process.env.FIREBASE_PROJECT_ID   || '').replace(/^"|"$/g, '').trim();
    const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').replace(/^"|"$/g, '').trim();
    const privateKey  = (process.env.FIREBASE_PRIVATE_KEY  || '')
        .replace(/\\n/g, '\n').replace(/^"|"$/g, '').trim();

    if (!getApps().length) {
        initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    }
    return getFirestore();
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
    if (!(await applyRateLimit(req, res, 'newsletter'))) return;

    const { email } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Email inválido' });
    }

    try {
        const db = initAdmin();
        // Usar el email como ID del documento para evitar duplicados
        await db.collection('newsletter').doc(email.toLowerCase()).set({
            email: email.toLowerCase(),
            subscribedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('[newsletter] Error:', err.message);
        return res.status(500).json({ error: 'Error al guardar el email' });
    }
}
