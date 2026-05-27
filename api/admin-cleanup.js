import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdmin } from './_verify-admin.js';

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

async function deleteCollection(db, collectionName) {
    const BATCH_SIZE = 400;
    let deleted = 0;

    while (true) {
        const snap = await db.collection(collectionName).limit(BATCH_SIZE).get();
        if (snap.empty) break;

        const batch = db.batch();
        snap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deleted += snap.docs.length;
    }

    return deleted;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const decoded = await verifyAdmin(req, res);
    if (!decoded) return;

    const { target } = req.body || {};
    if (!['orders', 'products', 'all'].includes(target)) {
        return res.status(400).json({ error: 'target debe ser "orders", "products" o "all"' });
    }

    try {
        const db = initAdmin();
        const result = {};

        if (target === 'orders' || target === 'all') {
            result.orders = await deleteCollection(db, 'orders');
        }
        if (target === 'products' || target === 'all') {
            result.products = await deleteCollection(db, 'products');
        }

        console.log('[admin-cleanup] Limpieza completada:', result);
        return res.status(200).json({ ok: true, deleted: result });
    } catch (err) {
        console.error('[admin-cleanup] Error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
