/**
 * VOLT Store — Proxy de etiqueta de envío Andreani (admin).
 *
 * Descarga la etiqueta (PDF) de un envío de Andreani y la reenvía al cliente
 * sin exponer el token de autenticación de Andreani.
 */

import { andreaniFetch } from './_andreani-auth.js';
import { verifyAdmin } from './_verify-admin.js';

const NUMERO_RE = /^[A-Za-z0-9-]+$/;

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

    const decoded = await verifyAdmin(req, res);
    if (!decoded) return;

    try {
        const numeroAndreani = String(req.query?.numeroAndreani || '').trim();
        if (!numeroAndreani || !NUMERO_RE.test(numeroAndreani)) {
            return res.status(400).json({ error: 'numeroAndreani inválido' });
        }

        const upstream = await andreaniFetch(`/v2/ordenes-de-envio/${encodeURIComponent(numeroAndreani)}/etiquetas`, {
            method: 'GET'
        });

        if (!upstream.ok) {
            const details = await upstream.text().catch(() => '');
            return res.status(502).json({ error: 'No se pudo obtener la etiqueta', details });
        }

        const contentType = upstream.headers.get('content-type') || 'application/pdf';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="etiqueta-${numeroAndreani}.pdf"`);
        return res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
        return res.status(500).json({ error: 'Error interno', details: error.message });
    }
}
