/**
 * app/api/revalidate/route.ts — Route Handler (App Router), no pages/api.
 *
 * `revalidatePath` (next/cache) solo funciona invocado desde un Route Handler o
 * Server Action de App Router: las páginas que este endpoint invalida
 * (`/producto/[slug]`, `/catalogo`, `/`) son App Router, y `res.revalidate()`
 * de pages/api no las alcanza. Ver CLAUDE.md — esto no reabre la decisión
 * "endpoints en pages/api": esa regla protege los endpoints de pagos ya
 * probados; este es nuevo y depende de una API que pages/api no tiene.
 *
 * Reemplaza a legacy `api/admin-redeploy.js` + `triggerRedeploy()` de
 * admin-products.js (POST con `Authorization: Bearer <idToken>`, sin body,
 * debounced 10s del lado del admin) — acá el redeploy completo se cambia por
 * invalidación puntual. Se cablea desde el panel admin en F9; por ahora el
 * contrato queda listo:
 *
 *   POST /api/revalidate
 *   Authorization: Bearer <idToken con claim admin>
 *   Body (JSON, opcional): { "slug"?: string }
 *     - siempre revalida "/" y "/catalogo"
 *     - si viene `slug`, además revalida "/producto/<slug>"
 */
import { revalidatePath } from 'next/cache';
import { checkAdminToken, extractBearerToken } from '@/lib/server/verify-admin';

export async function POST(req: Request) {
    const token = extractBearerToken(req.headers.get('authorization'));
    const result = await checkAdminToken(token);

    if (!result.ok) {
        return Response.json({ error: result.error }, { status: result.status });
    }

    // Body opcional y potencialmente ausente/inválido (el admin puede pedir
    // "revalidar todo" sin mandar nada) — nunca 400 por esto.
    let slug: string | undefined;
    try {
        const body = await req.json();
        if (body && typeof body.slug === 'string' && body.slug.trim()) {
            slug = body.slug.trim();
        }
    } catch {
        // sin body / body no-JSON: revalida solo home + catálogo
    }

    revalidatePath('/');
    revalidatePath('/catalogo');
    if (slug) revalidatePath(`/producto/${slug}`);

    return Response.json({ revalidated: true, paths: ['/', '/catalogo', ...(slug ? [`/producto/${slug}`] : [])] });
}
