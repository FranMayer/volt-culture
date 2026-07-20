/**
 * VOLT Store — Crear orden de envío en Andreani (admin).
 *
 * Genera la orden de envío en Andreani para una orden ya existente en
 * Firestore y persiste el número de envío + etiquetas resultantes.
 *
 * Variables de entorno:
 *   ANDREANI_CONTRATO (default '400006711', contrato de prueba)
 *   ANDREANI_ORIGEN_CP (default '5000')
 *   ANDREANI_ORIGEN_CALLE (default '')
 *   ANDREANI_ORIGEN_NUMERO (default '')
 *   ANDREANI_ORIGEN_LOCALIDAD (default 'Cordoba')
 *   ANDREANI_REMITENTE_EMAIL (default 'contacto@voltculture.com.ar')
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */

import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { andreaniFetch } from '@/lib/server/andreani-auth';
import { verifyAdmin } from '@/lib/server/verify-admin';

function buildAndreaniPayload({ contrato, destinatario, destino, bultos }) {
    return {
        contrato,
        origen: {
            postal: {
                codigoPostal: process.env.ANDREANI_ORIGEN_CP || '5000',
                calle: process.env.ANDREANI_ORIGEN_CALLE || '',
                numero: process.env.ANDREANI_ORIGEN_NUMERO || '',
                localidad: process.env.ANDREANI_ORIGEN_LOCALIDAD || 'Cordoba',
                region: '',
                pais: 'Argentina'
            }
        },
        destino: {
            postal: { ...destino.postal, pais: 'Argentina' }
        },
        remitente: {
            nombreCompleto: 'VOLT Culture',
            email: process.env.ANDREANI_REMITENTE_EMAIL || 'contacto@voltculture.com.ar'
        },
        destinatario: [{
            nombreCompleto: destinatario.nombreCompleto,
            email: destinatario.email,
            documentoTipo: destinatario.documentoTipo || 'DNI',
            documentoNumero: destinatario.documentoNumero,
            telefonos: [{ tipo: 1, numero: destinatario.telefono || '' }]
        }],
        bultos: bultos.map((b) => ({
            kilos: Number(b.kilos),
            volumenCm: Number(b.volumenCm3),
            valorDeclaradoSinImpuestos: Number(b.valorDeclarado) || 0
        }))
    };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const decoded = await verifyAdmin(req, res);
    if (!decoded) return;

    try {
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch { body = {}; }
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            body = {};
        }

        const orderId = String(body.orderId || '').trim();
        if (!orderId) {
            return res.status(400).json({ error: 'Falta orderId' });
        }

        const destinatario = body.destinatario || {};
        if (!destinatario.nombreCompleto || !destinatario.documentoNumero) {
            return res.status(400).json({ error: 'Faltan datos del destinatario (nombreCompleto, documentoNumero)' });
        }

        const postal = body.destino?.postal || {};
        if (!postal.codigoPostal || !postal.calle || !postal.numero || !postal.localidad) {
            return res.status(400).json({
                error: 'Faltan datos del destino (codigoPostal, calle, numero, localidad)'
            });
        }

        const bultos = Array.isArray(body.bultos) ? body.bultos : [];
        if (bultos.length === 0 || bultos.some((b) => !(Number(b.kilos) > 0))) {
            return res.status(400).json({ error: 'bultos inválido: debe ser un array con al menos un bulto y kilos > 0' });
        }

        const contrato = String(body.contrato || process.env.ANDREANI_CONTRATO || '400006711').trim();

        const db = adminDb();
        const orderRef = db.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        // Idempotencia: si ya se generó la orden de envío para este pedido (doble
        // click, dos admins concurrentes), devolvemos lo ya persistido en vez de
        // crear una segunda orden real en Andreani (facturable) que pisaría la primera.
        const existingAndreani = orderSnap.data()?.shipping?.andreani;
        if (existingAndreani?.numeroDeEnvio) {
            return res.status(200).json({
                numeroDeEnvio: existingAndreani.numeroDeEnvio,
                bultos: existingAndreani.bultos,
                alreadyExisted: true
            });
        }

        const andreaniPayload = buildAndreaniPayload({
            contrato,
            destinatario,
            destino: { postal },
            bultos
        });

        const upstream = await andreaniFetch('/v2/ordenes-de-envio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(andreaniPayload)
        });

        if (!upstream.ok) {
            const details = await upstream.text().catch(() => '');
            return res.status(502).json({ error: 'Andreani rechazó la orden de envío', details });
        }

        const json = await upstream.json();
        const resultBultos = (Array.isArray(json.bultos) ? json.bultos : []).map((b) => ({
            numeroDeEnvio: b.numeroDeEnvio,
            etiquetaUrl: `/api/etiqueta-andreani?numeroAndreani=${b.numeroDeEnvio}`
        }));

        if (resultBultos.length === 0) {
            return res.status(502).json({ error: 'Andreani no devolvió bultos en la orden de envío', details: JSON.stringify(json) });
        }

        await orderRef.set({
            shipping: {
                andreani: {
                    numeroDeEnvio: resultBultos[0].numeroDeEnvio,
                    bultos: resultBultos,
                    createdAt: FieldValue.serverTimestamp()
                }
            },
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        return res.status(200).json({
            numeroDeEnvio: resultBultos[0].numeroDeEnvio,
            bultos: resultBultos
        });
    } catch (error) {
        return res.status(500).json({ error: 'Error interno', details: error.message });
    }
}
