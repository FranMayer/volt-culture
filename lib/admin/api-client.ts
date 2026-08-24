/**
 * lib/admin/api-client.ts — fetch autenticado a pages/api/* desde el panel
 * admin. Mismo patrón que components/admin/ProductFormModal.tsx (auth.
 * currentUser?.getIdToken() + Bearer header), factorizado acá porque
 * OrdersTab (notify-status) lo necesita igual. Port del wrapper fetch de
 * legacy/js/admin-orders.js (getAdminToken/formatAdminApiError) — sin el
 * branch de "Live Server puerto 5500" (next dev sirve /api/* directo, ese
 * caso no existe acá).
 */
"use client";

import { auth } from "@/lib/firebase/client";

async function getAdminIdToken(): Promise<string> {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("Sesión expirada. Volvé a iniciar sesión en el panel.");
    return idToken;
}

async function throwOnError(resp: Response): Promise<void> {
    if (resp.ok) return;
    const err = await resp.json().catch(() => ({}) as { error?: string });
    throw new Error(err?.error || `Error ${resp.status}`);
}

/** GET/POST JSON a un endpoint admin con el Bearer token del admin logueado. */
export async function adminFetchJson<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
    const idToken = await getAdminIdToken();
    const resp = await fetch(path, {
        ...options,
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers,
            Authorization: `Bearer ${idToken}`,
        },
    });
    await throwOnError(resp);
    return resp.json();
}
