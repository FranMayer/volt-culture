/**
 * verify-admin.ts — Middleware para proteger rutas de pages/api que requieren rol admin.
 * Port de api/_verify-admin.js, ahora sobre el initAdmin único de lib/firebase/admin.
 *
 * USO en cualquier endpoint protegido:
 *
 *   import { verifyAdmin } from '@/lib/server/verify-admin';
 *
 *   export default async function handler(req: NextApiRequest, res: NextApiResponse) {
 *       const decoded = await verifyAdmin(req, res);
 *       if (!decoded) return; // ya respondió con 401 o 403
 *       // lógica protegida…
 *   }
 *
 * El cliente debe enviar el ID token en el header:
 *   Authorization: Bearer <idToken>
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { adminAuth } from '../firebase/admin';

/**
 * Verifica que el request contenga un ID token válido con claim admin === true.
 * - Si es válido: devuelve el decoded token.
 * - Si no: escribe la respuesta de error y devuelve null.
 */
export async function verifyAdmin(req: NextApiRequest, res: NextApiResponse) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (!token) {
        res.status(401).json({ error: 'Token no proporcionado' });
        return null;
    }

    try {
        const decoded = await adminAuth().verifyIdToken(token);

        if (decoded.admin !== true) {
            res.status(403).json({ error: 'Acceso denegado: se requiere rol admin' });
            return null;
        }

        return decoded;
    } catch {
        res.status(401).json({ error: 'Token inválido o expirado' });
        return null;
    }
}
