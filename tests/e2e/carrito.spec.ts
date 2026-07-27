// tests/e2e/carrito.spec.ts — quick-view -> agregar al carrito -> offcanvas ->
// cantidad -> persistencia -> vaciar. Todo localStorage/Zustand, sin red.
import { test, expect } from "@playwright/test";
import { openFirstQuickView } from "./helpers";

test("agregar al carrito desde el quick-view, actualizar cantidad, persistir y vaciar", async ({ page }) => {
    await page.goto("/catalogo");
    const dialog = await openFirstQuickView(page);

    const productTitle = (await dialog.locator(".product-quickview__title").textContent())?.trim() ?? "";
    expect(productTitle).not.toEqual("");

    // Color/talle si el producto los tiene (defaultVariantSelection ya deja
    // uno seleccionado; clickear el primero alcanza para "seleccionar").
    const colorSwatch = dialog.locator(".color-swatches .color-swatch").first();
    if (await colorSwatch.count()) {
        await colorSwatch.click();
    }
    const sizeBtn = dialog.locator(".size-buttons .size-btn:not(.is-disabled)").first();
    if (await sizeBtn.count()) {
        await sizeBtn.click();
    }

    await dialog.locator(".add-to-cart").click();

    const badge = page.locator("#cartBadge");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("1");

    // El add-to-cart pasa a "Eliminar del carrito" — cierra el quick-view sin
    // volver a tocar el carrito (evita un segundo toggle accidental).
    await dialog.locator(".product-quickview__close").click();
    await expect(dialog).toBeHidden();

    // Abrir el offcanvas del carrito.
    await page.locator(".btn-cart").click();
    const cartItem = page.locator("#cart-items .cart-item").first();
    await expect(cartItem).toBeVisible();
    await expect(cartItem.locator(".cart-item__title")).toHaveText(productTitle);

    const totalBefore = await page.locator("#cart-total").textContent();

    // Sumar cantidad y verificar que el subtotal se actualiza.
    await cartItem.locator(".qty-btn").nth(1).click(); // qty-plus (0=minus, 1=plus)
    await expect(cartItem.locator(".qty-input")).toHaveText("2");
    await expect(page.locator("#cart-total")).not.toHaveText(totalBefore ?? "");

    const badgeAfterQtyBump = await badge.textContent();
    expect(badgeAfterQtyBump).toEqual("2");

    // Reload: el carrito tiene que sobrevivir (contrato de persist + key
    // 'cart' — carritos existentes en localStorage sobreviven el cutover).
    await page.reload();
    await expect(page.locator("#cartBadge")).toHaveText("2");
    // CatalogView vuelve a pedir productos al montar: su loader-overlay
    // (position:fixed a pantalla completa) tapa el botón del carrito hasta
    // que termina de cargar — esperarlo evita un click flaky.
    await expect(page.locator(".loader-overlay")).toBeHidden();

    // Vaciar: badge vuelve a ocultarse (display:none a count 0).
    await page.locator(".btn-cart").click();
    await page.locator("#clear-cart").click();
    await expect(page.locator("#cartBadge")).toBeHidden();
    await expect(page.locator("#cart-empty")).toBeVisible();
});
