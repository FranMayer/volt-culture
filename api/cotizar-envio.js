/**
 * VOLT Store — Cotización de envío Andreani (público).
 *
 * Consulta la tarifa de Andreani para un código postal, peso y volumen dados.
 *
 * Variables de entorno:
 *   ANDREANI_CONTRATO (default '400006711', contrato de prueba)
 *   (ver api/_andreani-auth.js para credenciales y base URL)
 */

import { andreaniFetch } from './_andreani-auth.js';
import { applyRateLimit } from './_rate-limit.js';

const ALLOWED_ORIGINS = new Set([
    'https://voltculture.com.ar',
    'https://www.voltculture.com.ar',
    'http://localhost:3000'
]);

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
        const query = req.query || {};
        const codigoPostalDestino = String(query.codigoPostalDestino || '').trim();
        if (!/^\d{4}$/.test(codigoPostalDestino)) {
            return res.status(400).json({ error: 'codigoPostalDestino inválido: debe tener 4 dígitos' });
        }

        const pesoKg = Number(query.pesoKg);
        if (!Number.isFinite(pesoKg) || pesoKg <= 0) {
            return res.status(400).json({ error: 'pesoKg inválido: debe ser un número mayor a 0' });
        }

        const volumenCm3 = Number(query.volumenCm3);
        if (!Number.isFinite(volumenCm3) || volumenCm3 <= 0) {
            return res.status(400).json({ error: 'volumenCm3 inválido: debe ser un número mayor a 0' });
        }

        const contrato = String(query.contrato || process.env.ANDREANI_CONTRATO || '400006711').trim();

        const params = new URLSearchParams({
            cpDestino: codigoPostalDestino,
            contrato,
            'bultos[0][kilos]': String(pesoKg),
            'bultos[0][volumen]': String(volumenCm3)
        });

        const upstream = await andreaniFetch(`/v1/tarifas?${params.toString()}`, { method: 'GET' });

        if (!upstream.ok) {
            const details = await upstream.text().catch(() => '');
            return res.status(502).json({ error: 'No se pudo cotizar el envío', details });
        }

        const json = await upstream.json();
        return res.status(200).json({
            tarifaSinIva: Number(json.tarifaSinIva?.total),
            tarifaConIva: Number(json.tarifaConIva?.total)
        });
    } catch (error) {
        return res.status(500).json({ error: 'Error interno', details: error.message });
    }
}
