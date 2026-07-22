"use client";

import { useEffect, useRef, useState } from "react";
import type { Product } from "@/lib/types";
import { getAll, getProductImageFallback } from "@/lib/products";
import { getProductGallery } from "@/lib/catalog-helpers";

const FALLBACK_IMG = getProductImageFallback();
// legacy/index.html:1503 `data-limit="8"` on #homeFeaturedGrid.
const LIMIT = 8;

type Status = "loading" | "ready" | "empty" | "error";

// Port of legacy/js/home-featured.js — same "featured" selection criterion
// (featured === true, sorted by featuredOrder, fallback to all products) and
// same carousel scroll-by-card-width behavior. Reuses lib/products.ts
// (getAll) and lib/catalog-helpers.ts (getProductGallery, same image
// selection as ProductCard/CatalogView) instead of re-implementing the data
// layer.
//
// Data fetch is client-side (useEffect), matching the legacy page: the grid
// starts empty (both prev/next arrows `disabled`, matching legacy's initial
// HTML) and fills in after mount — this is also what keeps SSR/first-client-
// render markup identical (no hydration mismatch), since nothing here reads
// window/Date/Math.random during render.
export default function FeaturedCarousel() {
  const [status, setStatus] = useState<Status>("loading");
  const [products, setProducts] = useState<Product[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const [prevDisabled, setPrevDisabled] = useState(true);
  const [nextDisabled, setNextDisabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await getAll();
        const flagged = all
          .filter((p) => p.featured === true)
          .sort((a, b) => (a.featuredOrder ?? Infinity) - (b.featuredOrder ?? Infinity));
        const featured = (flagged.length ? flagged : all).slice(0, LIMIT);
        if (cancelled) return;
        setProducts(featured);
        setStatus(featured.length ? "ready" : "empty");
      } catch (err) {
        console.error("home-featured:", err);
        if (!cancelled) {
          setProducts([]);
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateArrows = () => {
    const grid = gridRef.current;
    if (!grid) return;
    setPrevDisabled(grid.scrollLeft <= 0);
    setNextDisabled(grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 1);
  };

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    updateArrows();
    grid.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      grid.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [products]);

  function step(): number {
    const grid = gridRef.current;
    const card = grid?.firstElementChild as HTMLElement | null;
    if (!grid || !card) return 0;
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    return card.getBoundingClientRect().width + gap;
  }

  function behavior(): ScrollBehavior {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  }

  return (
    <aside className="hero-featured" aria-labelledby="home-featured-heading">
      <div className="hero-featured__head">
        <div>
          <p className="hero-featured__eyebrow">/ 001 — SHOP</p>
          <h2 className="hero-featured__title" id="home-featured-heading">
            Destacados
          </h2>
        </div>
        <a className="hero-featured__link" href="/catalogo">
          Tienda →
        </a>
      </div>
      <p className="home-featured__status" id="homeFeaturedStatus" hidden={status === "ready" || status === "loading"}>
        {status === "error"
          ? "No pudimos cargar productos. Probá el shop."
          : "Pronto cargaremos el catálogo acá. Entrá al shop para ver todo."}
      </p>
      <div className="hero-featured__carousel">
        <div
          className="home-featured__grid home-featured__grid--carousel"
          id="homeFeaturedGrid"
          data-limit={LIMIT}
          ref={gridRef}
        >
          {products.map((p) => {
            const gallery = getProductGallery(p, FALLBACK_IMG);
            const img = gallery[0] || p.image || FALLBACK_IMG;
            const name = p.name || "Producto";
            const price = Number(p.price) || 0;
            return (
              <article className="home-featured-card" key={p.id}>
                <a href="/catalogo" className="home-featured-card__link" aria-label={`Ver ${name} en el shop`}>
                  <div className="home-featured-card__media">
                    <img
                      src={img}
                      alt={name}
                      className="home-featured-card__img"
                      width={480}
                      height={600}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = FALLBACK_IMG;
                      }}
                    />
                    <div className="home-featured-card__overlay" aria-hidden="true">
                      <span className="home-featured-card__cta">Ver en shop</span>
                    </div>
                  </div>
                  <div className="home-featured-card__body">
                    <h3 className="home-featured-card__title">{name}</h3>
                    <p className="home-featured-card__price">${price.toLocaleString("es-AR")}</p>
                  </div>
                </a>
              </article>
            );
          })}
        </div>
        <button
          type="button"
          className="hero-featured__arrow"
          id="homeFeaturedPrev"
          aria-label="Anterior"
          disabled={prevDisabled}
          onClick={() => gridRef.current?.scrollBy({ left: -step(), behavior: behavior() })}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          className="hero-featured__arrow"
          id="homeFeaturedNext"
          aria-label="Siguiente"
          disabled={nextDisabled}
          onClick={() => gridRef.current?.scrollBy({ left: step(), behavior: behavior() })}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
