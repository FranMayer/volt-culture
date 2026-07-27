// tests/e2e/helpers.ts — helpers compartidos de la suite E2E.
// Sin Page Object Model a propósito: con 3 specs es ceremonia que no aporta
// (ver ponytail en el resumen de la tarea). Todo lo que hace falta vive acá.
import { expect, type Locator, type Page } from "@playwright/test";
import type { CartItem } from "@/lib/types";

/**
 * Verifica que `locator` no esté tapado por otro elemento en su propio centro
 * visual — regresión de F10 (legacy: la página de producto quedaba invisible
 * bajo el grid negro de `body::before`, pero `toBeVisible()` pasaba igual
 * porque el elemento SEGUÍA siendo visible en el sentido de CSS/layout).
 * `elementFromPoint` en cambio devuelve lo que un usuario real vería/clickearía
 * en ese punto — si no es el elemento (o un descendiente suyo, ej. un <span>
 * de texto adentro de un botón), algo lo está tapando.
 */
export async function expectNotCovered(page: Page, locator: Locator, label = "elemento") {
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    if (!box) throw new Error(`expectNotCovered: "${label}" no tiene bounding box (¿oculto o desmontado?)`);
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    const result = await locator.evaluate(
        (node, pt) => {
            const el = document.elementFromPoint(pt.x, pt.y);
            if (!el) return { ok: false, tag: null as string | null, cls: null as string | null };
            return { ok: el === node || node.contains(el), tag: el.tagName, cls: String(el.className) };
        },
        point
    );

    expect(result.ok, `"${label}" está tapado en su centro por <${result.tag} class="${result.cls}">`).toBe(true);
}

/** Desactiva el intro "lights-out" de la home (solo corre en la primera carga
 * de sesión, gateado por sessionStorage — ver lib/motion/useLightsOut.ts).
 * Debe llamarse ANTES de page.goto(). */
export async function disableLightsOut(page: Page) {
    await page.addInitScript(() => {
        window.sessionStorage.setItem("voltLightsOut", "1");
    });
}

/**
 * Siembra el carrito escribiendo directo en localStorage con la key 'cart' y
 * el shape que realmente persiste zustand/persist: `{state:{items}, version}`
 * (ver lib/cart/store.ts `legacyCompatStorage` + CLAUDE.md). Debe llamarse
 * ANTES de page.goto() para que el AuthProvider la levante en su rehydrate()
 * post-mount.
 */
export async function seedCart(page: Page, items: CartItem[]) {
    const raw = JSON.stringify({ state: { items }, version: 0 });
    await page.addInitScript((json) => {
        window.localStorage.setItem("cart", json);
    }, raw);
}

/**
 * Abre el quick-view del primer producto del catálogo. Asume que `page` ya
 * está en /catalogo (o navega ahí si no). Devuelve el locator del diálogo,
 * ya esperado visible.
 */
export async function openFirstQuickView(page: Page): Promise<Locator> {
    if (!page.url().includes("/catalogo")) {
        await page.goto("/catalogo");
    }
    const firstCard = page.locator(".product-card").first();
    await expect(firstCard).toBeVisible();
    await firstCard.locator(".product-expand-toggle").click();
    const dialog = page.locator(".product-quickview__dialog");
    await expect(dialog).toBeVisible();
    return dialog;
}

/**
 * Devuelve la URL (path) del primer producto del catálogo. NO hardcodea un
 * slug: los productos vienen de Firestore y cambian. Abre y cierra el
 * quick-view para leer el permalink real (`productPath()`, mismo helper que
 * usa toda la app).
 */
export async function firstProductPath(page: Page): Promise<string> {
    const dialog = await openFirstQuickView(page);
    const href = await dialog.locator(".product-quickview__permalink").getAttribute("href");
    if (!href) throw new Error("firstProductPath: el quick-view no tiene link de permalink");
    await dialog.locator(".product-quickview__close").click();
    await expect(dialog).toBeHidden();
    return href;
}
