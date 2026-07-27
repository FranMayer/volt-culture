// tests/e2e/producto.spec.ts — home, catálogo y página de producto.
// Solo lectura: getAll()/getById() contra Firestore, sin escrituras.
import { test, expect } from "@playwright/test";
import { disableLightsOut, expectNotCovered, firstProductPath } from "./helpers";

test("home carga con navbar visible y sin errores de consola", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await disableLightsOut(page);
    await page.goto("/");

    await expect(page.locator("nav#mainHeader")).toBeVisible();
    expect(consoleErrors, `errores de consola en home: ${consoleErrors.join(" | ")}`).toEqual([]);
});

test("catálogo renderiza al menos un product-card", async ({ page }) => {
    await page.goto("/catalogo");
    await expect(page.locator(".product-card").first()).toBeVisible();
    expect(await page.locator(".product-card").count()).toBeGreaterThan(0);
});

test("página de producto: título, precio, imagen y controles no tapados", async ({ page }) => {
    await page.goto("/catalogo");
    const path = await firstProductPath(page);

    await page.goto(path);

    const h1 = page.locator("h1.pp-title");
    await expect(h1).toBeVisible();
    await expect(h1).not.toHaveText("");

    const price = page.locator(".pp-price");
    await expect(price).toBeVisible();
    await expect(price).toContainText("$");

    // Imagen principal cargada de verdad, no el fallback roto (naturalWidth 0
    // = la carga falló, aunque el <img> siga "visible" para Playwright).
    const mainImage = page.locator(".pp-img > img").first();
    await expect(mainImage).toBeVisible();
    await expect
        .poll(() => mainImage.evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0);

    const buyButton = page.locator(".product-buttons .add-to-cart");
    await expect(buyButton).toBeVisible();

    // Regresión de F10: el bug hacía que toda esta sección quedara detrás de
    // la grilla de fondo (`body::before`) — visible para el CSS, invisible
    // para un usuario real.
    await expectNotCovered(page, h1, "título del producto (h1.pp-title)");
    await expectNotCovered(page, price, "precio (.pp-price)");
    await expectNotCovered(page, buyButton, "botón de compra (.add-to-cart)");
});
