import { adminDb } from '@/lib/firebase/admin';
import { verifyAdmin } from '@/lib/server/verify-admin';
import { esDeOrden, idEventoDeOrden } from '@/lib/brain/engine.js';

/**
 * Borra una orden y su evento gemelo en brain_eventos. Los dos juntos o el
 * balance de Brain sigue contando una venta que ya no existe.
 * ponytail: no repone stock — una orden pagada ya lo descontó (webhook.js,
 * flag inventoryAdjusted) y reponerlo a ciegas infla el inventario de las
 * órdenes reales. Corregir a mano en Productos si la de prueba movió stock.
 */
async function deleteOrder(db, docId) {
    const ref = db.collection('orders').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return null;

    const eventoId = idEventoDeOrden(snap.data(), docId);
    await db.collection('brain_eventos').doc(eventoId).delete();
    await ref.delete();
    return { order: docId, brainEvento: eventoId };
}

/**
 * Los eventos de Brain importados desde órdenes. Un borrado masivo de pedidos
 * tiene que llevárselos igual que el individual, pero sin tocar los cargados a
 * mano (feria, gastos, marketing), que no tienen orden detrás.
 */
async function deleteBrainTwins(db) {
    const snap = await db.collection('brain_eventos').get();
    const huerfanos = snap.docs.filter(d => esDeOrden(d.id));

    for (let i = 0; i < huerfanos.length; i += 400) {
        const batch = db.batch();
        huerfanos.slice(i, i + 400).forEach(d => batch.delete(d.ref));
        await batch.commit();
    }

    return huerfanos.length;
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

    const { target, id } = req.body || {};
    if (!['order', 'orders', 'products', 'all'].includes(target)) {
        return res.status(400).json({ error: 'target debe ser "order", "orders", "products" o "all"' });
    }
    if (target === 'order' && !id) {
        return res.status(400).json({ error: 'target "order" requiere el id del documento' });
    }

    try {
        const db = adminDb();
        const result = {};

        if (target === 'order') {
            const deleted = await deleteOrder(db, String(id));
            if (!deleted) return res.status(404).json({ error: 'La orden ya no existe' });
            console.log('[admin-cleanup] Orden borrada:', deleted);
            return res.status(200).json({ ok: true, deleted });
        }

        if (target === 'orders' || target === 'all') {
            result.orders = await deleteCollection(db, 'orders');
            result.brainEventos = await deleteBrainTwins(db);
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
