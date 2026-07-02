import { verifyAdmin } from './_verify-admin.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const decoded = await verifyAdmin(req, res);
    if (!decoded) return;

    const hook = (process.env.VERCEL_DEPLOY_HOOK_URL || '').trim();
    if (!hook) {
        console.warn('[admin-redeploy] VERCEL_DEPLOY_HOOK_URL no configurado — no se dispara redeploy');
        return res.status(200).json({ triggered: false, reason: 'hook_no_configurado' });
    }

    try {
        const r = await fetch(hook, { method: 'POST' });
        if (!r.ok) throw new Error(`Hook HTTP ${r.status}`);
        return res.status(200).json({ triggered: true });
    } catch (e) {
        console.error('[admin-redeploy] Error disparando hook:', e.message);
        return res.status(502).json({ triggered: false, error: e.message });
    }
}
