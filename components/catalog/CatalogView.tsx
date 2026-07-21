"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Product } from "@/lib/types";
import { getAll, getProductImageFallback } from "@/lib/products";
import { getProductGallery, matchFilterFromQuery } from "@/lib/catalog-helpers";
import CategorySidebar, { type FilterState } from "./CategorySidebar";
import ProductCard from "./ProductCard";
import QuickViewModal from "./QuickViewModal";
import Lightbox from "./Lightbox";

const FALLBACK_IMG = getProductImageFallback();
const DEFAULT_FILTER: FilterState = { line: "F1", category: "all" };

type LightboxState = { gallery: string[]; index: number; name: string };

// Port of legacy/js/catalog.js — orchestrates data loading (lib/products,
// Tarea 1), the two-level category filter, the product grid, the quick-view
// modal and the lightbox. `?product=<id>` deep-link mirrors legacy's
// deepLinkHandled-once behavior (legacy:66-81).
export default function CatalogView() {
  const searchParams = useSearchParams();

  // legacy applyCategoryFromQuery() ran a second loadProducts() after the
  // initial one if `?line=`/`?cat=` matched; computing the initial filter
  // synchronously here gets to the same end state in a single fetch.
  const [filterState, setFilterState] = useState<FilterState>(
    () => matchFilterFromQuery(searchParams?.get("line"), searchParams?.get("cat")) ?? DEFAULT_FILTER
  );
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

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setLoading(true);
      try {
        const category = filterState.category === "all" ? null : filterState.category;
        const line = filterState.line === "all" ? null : filterState.line;
        const list = await getAll(category, line);
        if (cancelled) return;

        setProducts(list);
        setLoadError(false);

        if (list.length > 0 && !deepLinkHandled.current) {
          deepLinkHandled.current = true;
          const wantedId = searchParams?.get("product");
          if (wantedId) {
            let target = list.find((p) => String(p.id) === wantedId);
            if (!target) {
              // El filtro inicial puede no incluir el producto buscado: las
              // páginas /producto/ enlazan con ?product= a cualquier línea
              // (legacy:71-78).
              const all = await getAll(null, null);
              if (cancelled) return;
              target = all.find((p) => String(p.id) === wantedId);
            }
            if (target) setQuickViewProduct(target);
          }
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
  }, [filterState.line, filterState.category]);

  function openLightboxFor(product: Product, currentSrc: string) {
    const gallery = getProductGallery(product, FALLBACK_IMG);
    if (!gallery.length) return;
    const idx = Math.max(0, gallery.indexOf(currentSrc));
    setLightbox({ gallery, index: idx, name: product.name });
  }

  const noProducts = !loading && !loadError && products.length === 0;

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
            onSelect={setFilterState}
            open={sidebarOpen}
            onToggleOpen={() => setSidebarOpen((v) => !v)}
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

            {products.map((product, index) => (
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
