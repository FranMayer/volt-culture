// tests/e2e/checkout.spec.ts — stepper de checkout hasta ANTES de disparar el
// pago. No se crea preferencia de MercadoPago ni orden real en ningún test de
// este archivo (ver guard de /api/create-preference en cada test).
import { test, expect } from "@playwright/test";
import { seedCart } from "./helpers";
import type { CartItem } from "@/lib/types";

const TEST_ITEM: CartItem = {
    id: "e2e-test-item",
    title: "Producto E2E",
    price: 10000,
    quantity: 1,
    image: "/images-brand/Isotipo color.png",
};

/** Abre el checkout en modo Mercado Pago desde el offcanvas del carrito
 * (ya sembrado vía seedCart antes del goto). */
async function openCheckout(page: import("@playwright/test").Page) {
    await page.locator(".btn-cart").click();
    await page.locator("#checkout-btn").click();
    const modal = page.locator("#customerDataModal");
    await expect(modal).toBeVisible();
    return modal;
}

test.describe("checkout", () => {
    test.beforeEach(async ({ page }) => {
        await seedCart(page, [TEST_ITEM]);
        await page.goto("/catalogo");
    });

    test("DNI inválido muestra error y no deja avanzar del paso 1", async ({ page }) => {
        let createPreferenceCalled = false;
        await page.route("**/api/create-preference", async (route) => {
            createPreferenceCalled = true;
            await route.abort();
        });

        const modal = await openCheckout(page);
        await modal.locator("#customerName").fill("Test E2E");
        await modal.locator("#customerDni").fill("123456"); // 6 dígitos: inválido (se exige 7 u 8)
        await modal.locator("#customerPhone").fill("3511234567");
        await modal.locator("#customerEmail").fill("test@example.com");

        await modal.getByRole("button", { name: "Continuar" }).click();

        await expect(modal.locator(".volt-checkout-error")).toContainText("DNI");
        // Sigue en el paso 1: el panel de envío no está visible.
        await expect(modal.locator(".volt-stepper__item").nth(0)).toHaveClass(/is-active/);
        await expect(modal.locator(".volt-stepper__item").nth(1)).not.toHaveClass(/is-active/);

        expect(createPreferenceCalled).toBe(false);
    });

    test("avanza los 3 pasos con datos válidos y frena antes de pagar", async ({ page }) => {
        let createPreferenceCalled = false;
        await page.route("**/api/create-preference", async (route) => {
            createPreferenceCalled = true;
            await route.abort();
        });

        const modal = await openCheckout(page);

        // Paso 1 — datos.
        await modal.locator("#customerName").fill("Test E2E");
        await modal.locator("#customerDni").fill("30111222");
        await modal.locator("#customerPhone").fill("3511234567");
        await modal.locator("#customerEmail").fill("test@example.com");
        await modal.getByRole("button", { name: "Continuar" }).click();
        await expect(modal.locator(".volt-stepper__item").nth(1)).toHaveClass(/is-active/);

        // Paso 2 — envío. Cordoba no depende de red externa (Andreani sí, y
        // el checkout puede degradar esa cotización — se prueba aparte).
        await modal.getByRole("button", { name: /Envío Córdoba/ }).click();
        await modal.getByRole("button", { name: "Continuar" }).click();
        await expect(modal.locator(".volt-stepper__item").nth(2)).toHaveClass(/is-active/);

        // Paso 3 — resumen/pago. El botón de pago está visible pero NUNCA se
        // clickea en este spec.
        const payButton = modal.locator("#customerDataConfirm");
        await expect(payButton).toBeVisible();
        await expect(payButton).toHaveText(/IR A PAGAR CON MERCADO PAGO/);
        await expect(modal.locator("#checkoutSummaryItems")).toContainText(TEST_ITEM.title);

        expect(createPreferenceCalled).toBe(false);
    });

    test("cotización Andreani degrada sin credenciales y no bloquea el formulario", async ({ page }) => {
        let createPreferenceCalled = false;
        await page.route("**/api/create-preference", async (route) => {
            createPreferenceCalled = true;
            await route.abort();
        });

        const modal = await openCheckout(page);
        await modal.locator("#customerName").fill("Test E2E");
        await modal.locator("#customerDni").fill("30111222");
        await modal.locator("#customerPhone").fill("3511234567");
        await modal.locator("#customerEmail").fill("test@example.com");
        await modal.getByRole("button", { name: "Continuar" }).click();

        await modal.getByRole("button", { name: /Andreani/ }).click();
        await modal.locator("#shippingPostalCode").fill("5000");

        // No asumimos que la cotización devuelve números (ANDREANI_USER/PASS
        // no están configuradas en este entorno, ver CheckoutModal fetchQuote
        // catch): solo que el estado deja de estar "cotizando" — tolera tanto
        // un número real como el mensaje de error.
        await expect
            .poll(async () => (await modal.locator("#andreaniQuoteBox").textContent()) ?? "", { timeout: 10000 })
            .not.toMatch(/Cotizando envío/);

        const quoteText = (await modal.locator("#andreaniQuoteBox").textContent()) ?? "";
        expect(quoteText.length).toBeGreaterThan(0);

        expect(createPreferenceCalled).toBe(false);
    });
});
