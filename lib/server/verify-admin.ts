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
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../firebase/admin';

export function extractBearerToken(authHeader: string | null | undefined): string | null {
    if (!authHeader) return null;
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
}

export type AdminCheckResult =
    | { ok: true; decoded: DecodedIdToken }
    | { ok: false; status: 401 | 403; error: string };

/**
 * Núcleo de la verificación admin (sin acoplar a NextApiResponse ni a Request/Headers
 * de Fetch API), para que tanto `verifyAdmin` (pages/api) como los Route Handlers de
 * App Router (p. ej. app/api/revalidate) validen exactamente el mismo criterio:
 * ID token válido + claim `admin === true`.
 */
export async function checkAdminToken(token: string | null): Promise<AdminCheckResult> {
    if (!token) {
        return { ok: false, status: 401, error: 'Token no proporcionado' };
    }

    try {
        const decoded = await adminAuth().verifyIdToken(token);

        if (decoded.admin !== true) {
            return { ok: false, status: 403, error: 'Acceso denegado: se requiere rol admin' };
        }

        return { ok: true, decoded };
    } catch {
        return { ok: false, status: 401, error: 'Token inválido o expirado' };
    }
}

/**
 * Verifica que el request contenga un ID token válido con claim admin === true.
 * - Si es válido: devuelve el decoded token.
 * - Si no: escribe la respuesta de error y devuelve null.
 */
export async function verifyAdmin(req: NextApiRequest, res: NextApiResponse) {
    const token = extractBearerToken(req.headers['authorization'] as string | undefined);
    const result = await checkAdminToken(token);

    if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return null;
    }

    return result.decoded;
}
