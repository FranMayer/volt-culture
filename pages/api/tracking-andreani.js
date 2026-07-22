/**
 * VOLT Store — Tracking de envío Andreani (público).
 *
 * Devuelve la traza de eventos de un envío de Andreani para que el cliente
 * pueda seguir su pedido.
 */

import { andreaniFetch } from '@/lib/server/andreani-auth';
import { applyRateLimit } from '@/lib/server/rate-limit';

const ALLOWED_ORIGINS = new Set([
    'https://voltculture.com.ar',
    'https://www.voltculture.com.ar',
    'http://localhost:3000'
]);

const NUMERO_RE = /^[A-Za-z0-9-]+$/;

/**
 * Valida Origin y setea headers CORS si corresponde.
 * Un GET same-origin (o una llamada server-to-server) no manda header Origin,
 * así que su ausencia se permite sin CORS (el rate limit sigue protegiendo).
 * Si Origin está presente, debe estar en ALLOWED_ORIGINS o se rechaza.
 * @returns {boolean}
 */
function applyCors(req, res) {
    const origin = req.headers.origin;
    if (!origin) {
        return true;
    }
    if (!ALLOWED_ORIGINS.has(origin)) {
        return false;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return true;
}

export default async function handler(req, res) {
    if (!applyCors(req, res)) {
        return res.status(403).json({ error: 'Origin no permitido' });
    }

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
    if (!(await applyRateLimit(req, res, 'public-default'))) return;

    try {
        const numeroAndreani = String(req.query?.numeroAndreani || '').trim();
        if (!numeroAndreani || !NUMERO_RE.test(numeroAndreani)) {
            return res.status(400).json({ error: 'numeroAndreani inválido' });
        }

        const upstream = await andreaniFetch(`/v2/envios/${encodeURIComponent(numeroAndreani)}/trazas`, {
            method: 'GET'
        });

        if (!upstream.ok) {
            const details = await upstream.text().catch(() => '');
            return res.status(502).json({ error: 'No se pudo obtener el tracking', details });
        }

        const json = await upstream.json();
        const eventosRaw = Array.isArray(json) ? json : (json.eventos || []);
        const eventos = eventosRaw.map((e) => ({
            fecha: e.Fecha || e.fecha || null,
            estado: e.Estado || e.estado || '',
            motivo: e.Motivo || e.motivo || null,
            sucursal: e.Sucursal || e.sucursal || null
        }));

        return res.status(200).json({ numeroDeEnvio: numeroAndreani, eventos });
    } catch (error) {
        return res.status(500).json({ error: 'Error interno', details: error.message });
    }
}
