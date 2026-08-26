"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Product } from "@/lib/types";
import { getAll, getProductImageFallback } from "@/lib/products";
import { catalogHref, getProductGallery, matchFilterFromQuery } from "@/lib/catalog-helpers";
import CategorySidebar, { type FilterState } from "./CategorySidebar";
import ProductCard from "./ProductCard";
import QuickViewModal from "./QuickViewModal";
import Lightbox from "./Lightbox";

const FALLBACK_IMG = getProductImageFallback();
const DEFAULT_FILTER: FilterState = { line: "all", category: "all" };

type LightboxState = { gallery: string[]; index: number; name: string };

// Port of legacy/js/catalog.js — orchestrates data loading (lib/products,
// Tarea 1), the two-level category filter, the product grid, the quick-view
// modal and the lightbox. `?product=<id>` deep-link mirrors legacy's
// deepLinkHandled-once behavior (legacy:66-81).
export default function CatalogView() {
  const searchParams = useSearchParams();

  // La URL es la fuente de verdad del filtro (no hay useState duplicado): cada
  // categoría tiene link propio `/catalogo?line=f1&cat=remeras`, compartible,
  // con back/forward del browser gratis. legacy applyCategoryFromQuery() corría
  // un segundo loadProducts() cuando `?line=`/`?cat=` matcheaba; acá el filtro
  // se aplica en memoria sobre el catálogo ya cargado, sin re-fetch.
  const router = useRouter();
  const filterState: FilterState =
    matchFilterFromQuery(searchParams?.get("line"), searchParams?.get("cat")) ?? DEFAULT_FILTER;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const deepLinkHandled = useRef(false);

  // legacy/js/catalog.js:888-901 — @keyframes fadeInUp was injected via a
  // runtime <style> tag rather than living in a stylesheet; replicated
  // as-is instead of touching app/styles (CLAUDE.md: CSS portado sin
  // reescribir). Cleaned up on unmount (legacy never did, but this is a
  // client component that can mount/unmount across client-side navigation).
  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.textContent = `
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(styleEl);
    return () => {
      styleEl.remove();
    };
  }, []);

  // Una sola lectura de Firestore con todo el catálogo activo; ambos filtros
  // (estética y prenda) se aplican en render. Así el sidebar puede contar
  // productos por cada opción y marcar las vacías como PRONTO, y cambiar de
  // filtro es instantáneo (antes cada cambio de categoría re-consultaba).
  // ponytail: filtrado en memoria — si el catálogo pasa de unos cientos de
  // productos, volver a filtrar `category` en la query de Firestore.
  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setLoading(true);
      try {
        const list = await getAll(null, null);
        if (cancelled) return;

        setProducts(list);
        setLoadError(false);

        if (list.length > 0 && !deepLinkHandled.current) {
          deepLinkHandled.current = true;
          // Las páginas /producto/ enlazan con ?product= a cualquier estética,
          // no solo a la filtrada (legacy:71-78) — `list` ya es todo el catálogo.
          const wantedId = searchParams?.get("product");
          const target = wantedId ? list.find((p) => String(p.id) === wantedId) : null;
          if (target) setQuickViewProduct(target);
        }
      } catch (err) {
        console.error("Error al cargar productos:", err);
        if (!cancelled) {
          setProducts([]);
          setLoadError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProducts();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openLightboxFor(product: Product, currentSrc: string) {
    const gallery = getProductGallery(product, FALLBACK_IMG);
    if (!gallery.length) return;
    const idx = Math.max(0, gallery.indexOf(currentSrc));
    setLightbox({ gallery, index: idx, name: product.name });
  }

  const visible = products.filter(
    (p) =>
      (filterState.line === "all" || p.line === filterState.line) &&
      (filterState.category === "all" || p.category === filterState.category)
  );

  // Cuántos productos tiene cada opción en TODO el catálogo (no dentro del otro
  // filtro): el badge significa "esto todavía no existe", y así no baila cada
  // vez que se toca el otro eje. null mientras carga.
  const countBy = (key: "line" | "category") =>
    products.reduce<Record<string, number>>((acc, p) => {
      const v = String(p[key] || (key === "line" ? "TC" : ""));
      acc[v] = (acc[v] || 0) + 1;
      return acc;
    }, {});
  const counts = loading ? null : { line: countBy("line"), category: countBy("category") };

  const noProducts = !loading && !loadError && visible.length === 0;

  return (
    <>
      <div className="loader-overlay" style={{ display: loading ? "flex" : "none" }}>
        <div className="loader" />
        <p>Cargando productos...</p>
      </div>

      <main id="main-content">
        <header className="shop-page-header volt-glow">
          <span className="volt-watermark" aria-hidden="true">
            TIENDA
          </span>
          <div className="shop-page-header__deco" aria-hidden="true" />
          <img
            src="/images-brand/brand-elements/2.svg"
            alt=""
            className="volt-brand-bg volt-brand-bg--line shop-page-header__brand"
            width={320}
            height={320}
            aria-hidden="true"
          />
          <p className="section-eyebrow">Catálogo</p>
          <h1 className="shop-page-header__title">Tienda</h1>
          <p className="shop-page-header__desc">
            Streetwear y motorsport — elegí categoría, talle y color. Agregá al carrito y elegí cómo pagar.
          </p>
        </header>

        <div className="bigbox">
          <CategorySidebar
            filterState={filterState}
            onSelect={(next) => router.push(catalogHref(next), { scroll: false })}
            open={sidebarOpen}
            onToggleOpen={() => setSidebarOpen((v) => !v)}
            counts={counts}
          />

          <div className="product-grid">
            {(noProducts || loadError) && (
              <div className="no-products-message" style={{ display: "block" }}>
                {loadError ? (
                  <p>No pudimos cargar los productos. Intentá de nuevo en unos minutos.</p>
                ) : (
                  <>
                    <p className="no-products-message__title">Próximamente</p>
                    <p className="no-products-message__sub">
                      Esta categoría no tiene productos disponibles todavía. ¡Volvé pronto!
                    </p>
                  </>
                )}
              </div>
            )}

            {visible.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                index={index}
                onOpenQuickView={() => setQuickViewProduct(product)}
                onOpenLightbox={(src) => openLightboxFor(product, src)}
              />
            ))}
          </div>
        </div>
      </main>

      {quickViewProduct && (
        <QuickViewModal
          product={quickViewProduct}
          onClose={() => setQuickViewProduct(null)}
          onOpenLightbox={(src) => openLightboxFor(quickViewProduct, src)}
          lightboxOpen={!!lightbox}
        />
      )}

      {lightbox && (
        <Lightbox
          gallery={lightbox.gallery}
          startIndex={lightbox.index}
          name={lightbox.name}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
}
