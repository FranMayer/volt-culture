// tests/e2e/hero-video.spec.ts — loop de fondo del hero (components/home/HeroVideo.tsx).
// Solo lectura: no toca Firestore ni MP.
//
// Lo que protege: el <video> se monta SOLO en desktop con motion habilitado.
// Si alguien saca ese guard, mobile vuelve a descargar ~742 KB de video sin
// que nada más falle — por eso el assert que importa es el de bytes, no el
// de visibilidad.
import { test, expect } from "@playwright/test";
import { disableLightsOut, expectNotCovered } from "./helpers";

/** Cuenta descargas del mp4 del hero durante la carga. */
function trackVideoRequests(page: import("@playwright/test").Page) {
    const hits: string[] = [];
    page.on("request", (r) => {
        if (r.url().includes("/video/hero-loop")) hits.push(r.url());
    });
    return hits;
}

test.describe("hero background loop", () => {
    test("desktop: el video se monta, reproduce y no tapa la headline", async ({ page }) => {
        await disableLightsOut(page);
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto("/");

        const video = page.locator(".hero__bg-video");
        await expect(video).toBeAttached();

        // reproduciendo de verdad, no solo presente en el DOM
        await expect
            .poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0), {
                message: "el loop del hero nunca arrancó",
            })
            .toBe(true);

        // el fondo va detrás de todo el contenido del hero
        await expectNotCovered(page, page.locator(".hero__headline"), "headline del hero");
    });

    test("mobile: sin video y sin descargar el mp4", async ({ page }) => {
        const hits = trackVideoRequests(page);
        await disableLightsOut(page);
        await page.setViewportSize({ width: 375, height: 780 });
        await page.goto("/");
        await page.waitForTimeout(1500);

        await expect(page.locator(".hero__bg-video")).toHaveCount(0);
        expect(hits, `mobile descargó el video del hero: ${hits.join(", ")}`).toEqual([]);
    });

    test("prefers-reduced-motion: sin video y sin descargar el mp4", async ({ page }) => {
        const hits = trackVideoRequests(page);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await disableLightsOut(page);
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto("/");
        await page.waitForTimeout(1500);

        await expect(page.locator(".hero__bg-video")).toHaveCount(0);
        expect(hits, `reduced-motion descargó el video del hero: ${hits.join(", ")}`).toEqual([]);
    });

    test("el poster queda pintado siempre, con o sin video", async ({ page }) => {
        await disableLightsOut(page);
        await page.setViewportSize({ width: 375, height: 780 });
        await page.goto("/");

        const bg = await page
            .locator(".hero__bg")
            .evaluate((el) => getComputedStyle(el).backgroundImage);
        expect(bg).toContain("hero-poster");
    });
});
