// Baseline visual capture — screenshots de producción (o BASE_URL) en 3 viewports.
// Reutilizable en F1-F10 como referencia objetiva de paridad. No forma parte del build de Next.
//
// Uso: node qa/capture-baseline.mjs
//      BASE_URL=https://<preview>.vercel.app node qa/capture-baseline.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = process.env.BASE_URL || "https://www.voltculture.com.ar";
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "baseline");

const VIEWPORTS = [
  { name: "360", width: 360, height: 800 },
  { name: "768", width: 768, height: 1024 },
  { name: "1280", width: 1280, height: 800 },
];

const STATIC_PAGES = [
  { name: "home", path: "/" },
  { name: "catalogo", path: "/pages/catalogo.html" },
  { name: "about", path: "/pages/about.html" },
  { name: "envios", path: "/pages/envios.html" },
  { name: "novedades", path: "/pages/novedades.html" },
  { name: "mis-pedidos", path: "/pages/mis-pedidos.html" },
];

// Settle delay tras networkidle: da tiempo a fuentes/animaciones CSS de asentar.
const SETTLE_MS = 600;

async function settle(page) {
  // ponytail: algunas páginas (home/catalogo/producto) tienen listeners de Firebase/GA
  // que nunca dejan la red en idle real → cap corto, no bloqueante, con fallback al settle delay.
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await page.waitForTimeout(SETTLE_MS);
}

/** Resuelve un slug de producto real desde el sitemap de producción. */
async function getRealProductSlug(page) {
  const res = await page.request.get(`${BASE_URL}/sitemap.xml`);
  const xml = await res.text();
  const match = xml.match(/\/producto\/([^<]+)\.html/);
  if (!match) throw new Error("No se encontró ningún /producto/*.html en el sitemap");
  return match[1];
}

/** Scrollea de arriba a abajo en pasos de un viewport para disparar reveals por
 * IntersectionObserver (volt-motion) e imágenes lazy antes del fullPage screenshot;
 * si no se visita cada sección nunca entran en viewport y quedan opacity:0. */
async function triggerLazyContent(page) {
  const viewportHeight = (page.viewportSize() || { height: 800 }).height;
  let y = 0;
  for (let i = 0; i < 40; i++) {
    const atBottom = await page.evaluate((scrollY) => {
      window.scrollTo(0, scrollY);
      return scrollY + window.innerHeight >= document.body.scrollHeight;
    }, y);
    await page.waitForTimeout(250);
    if (atBottom) break;
    y += viewportHeight;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400); // reveals/animaciones del tramo superior vuelven a asentar
}

async function shoot(page, name, width) {
  await triggerLazyContent(page);
  const file = path.join(OUT_DIR, `${name}-${width}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ✓ ${path.basename(file)}`);
}

async function captureStaticPages(context, productSlug) {
  const pages = [...STATIC_PAGES, { name: "producto", path: `/producto/${productSlug}.html` }];

  for (const vp of VIEWPORTS) {
    const page = await context.newPage();
    await page.setViewportSize({ width: vp.width, height: vp.height });

    for (const p of pages) {
      console.log(`[${vp.name}] ${p.name} (${p.path})`);
      try {
        await page.goto(`${BASE_URL}${p.path}`, { waitUntil: "load", timeout: 30000 });

        if (p.name === "home") {
          // Intro "lights-out": esperar a que el overlay quede afuera (o directamente ausente/oculto)
          // antes de capturar. Fallback CSS del propio sitio lo saca solo a los 5s si el JS no corre.
          await page
            .waitForFunction(() => {
              const overlay = document.getElementById("voltLightsOut");
              if (!overlay) return true;
              const style = getComputedStyle(overlay);
              return (
                overlay.classList.contains("is-out") ||
                style.display === "none" ||
                style.visibility === "hidden" ||
                Number(style.opacity) === 0
              );
            }, { timeout: 8000 })
            .catch(() => console.warn("  ! overlay lights-out no confirmó estado final, capturo igual"));
        }

        await settle(page);
        await shoot(page, p.name, vp.width);
      } catch (err) {
        console.error(`  ✗ FALLÓ ${p.name}@${vp.width}: ${err.message}`);
      }
    }

    await page.close();
  }
}

/** Agrega el primer producto del catálogo al carrito, dejando el estado listo para offcanvas/checkout.
 * catalog.js no pone el botón "add-to-cart" en la card de la grilla: el trigger
 * (".product-expand-toggle") abre un quick-view modal y el "add-to-cart" real vive ahí adentro. */
async function addFirstProductToCart(page) {
  await page.goto(`${BASE_URL}/pages/catalogo.html`, { waitUntil: "load", timeout: 30000 });
  await settle(page);

  const expandToggle = page.locator(".product-expand-toggle").first();
  await expandToggle.waitFor({ state: "visible", timeout: 15000 });
  await expandToggle.click();

  const addBtn = page.locator(".product-quickview .add-to-cart:not([disabled])").first();
  await addBtn.waitFor({ state: "visible", timeout: 10000 });
  await addBtn.click();

  // Badge del carrito reacciona al agregar (ver main.js) — esperamos a que se muestre.
  await page
    .locator("#cartBadge")
    .waitFor({ state: "visible", timeout: 5000 })
    .catch(() => {});
  await page.waitForTimeout(300);

  // Cerrar el quick-view para que no tape el botón de carrito del navbar.
  await page.locator(".product-quickview__close").click().catch(() => {});
  await page.waitForTimeout(200);
}

async function captureCartOffcanvas(context) {
  const results = { offcanvas: false, checkout: false };

  for (const vp of VIEWPORTS) {
    const page = await context.newPage();
    await page.setViewportSize({ width: vp.width, height: vp.height });
    console.log(`[${vp.name}] cart-offcanvas / checkout-step1`);

    try {
      await addFirstProductToCart(page);

      const cartBtn = page.locator(".btn-cart");
      await cartBtn.waitFor({ state: "visible", timeout: 5000 });
      await cartBtn.click();
      await page.locator("#offcanvasRight.show").waitFor({ state: "visible", timeout: 5000 });
      await page.waitForTimeout(400); // transición Bootstrap del offcanvas
      await shoot(page, "cart-offcanvas", vp.width);
      results.offcanvas = true;
    } catch (err) {
      console.error(`  ✗ FALLÓ cart-offcanvas@${vp.width}: ${err.message}`);
    }

    try {
      const checkoutBtn = page.locator("#checkout-btn");
      await checkoutBtn.waitFor({ state: "visible", timeout: 5000 });
      // El botón nace disabled hasta que catalog.js confirma el estado del carrito.
      await page
        .waitForFunction(
          () => !document.getElementById("checkout-btn")?.disabled,
          { timeout: 10000 }
        )
        .catch(() => {});
      await checkoutBtn.click({ force: true });
      await page.locator("#customerDataModal.show").waitFor({ state: "visible", timeout: 10000 });
      await page.locator("#checkoutStep1.is-visible").waitFor({ state: "visible", timeout: 5000 });
      await page.waitForTimeout(400); // transición Bootstrap del modal
      await shoot(page, "checkout-step1", vp.width);
      results.checkout = true;
    } catch (err) {
      console.error(`  ✗ FALLÓ checkout-step1@${vp.width}: ${err.message}`);
    }

    await page.close();
  }

  return results;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Baseline contra: ${BASE_URL}\nSalida: ${OUT_DIR}\n`);

  const browser = await chromium.launch();
  const context = await browser.newContext();

  const sitemapPage = await context.newPage();
  const productSlug = await getRealProductSlug(sitemapPage);
  await sitemapPage.close();
  console.log(`Slug de producto usado: ${productSlug}\n`);

  await captureStaticPages(context, productSlug);
  console.log("");
  const interactive = await captureCartOffcanvas(context);

  await browser.close();

  console.log("\n--- Resumen ---");
  console.log(`cart-offcanvas: ${interactive.offcanvas ? "OK" : "FALLÓ (ver arriba)"}`);
  console.log(`checkout-step1: ${interactive.checkout ? "OK" : "FALLÓ (ver arriba)"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
