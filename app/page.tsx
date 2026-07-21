import type { Metadata } from "next";
import "@/app/styles/home.css";
import FeaturedCarousel from "@/components/home/FeaturedCarousel";
import HomeMotion from "@/components/home/HomeMotion";

// Ported from legacy/index.html <head> (title/description only — OG/canonical
// parity deferred, same call as app/catalogo/page.tsx in F4).
export const metadata: Metadata = {
  title: "VOLT | Motorsport-Inspired Streetwear · Córdoba, Argentina",
  description:
    "VOLT — Motorsport-inspired streetwear from Córdoba, Argentina. Built for the fast lane.",
};

// Port of legacy/index.html body markup (lines 1385-1628, minus the
// navbar/offcanvas/footer/whatsapp block already covered by the shared
// layout — see app/styles/home.css header comment for why). Structural
// parity from F6 Tarea 1; F6 Tarea 2 (<HomeMotion/> below) wires the
// volt-motion adaptation (intro sequence, FLIP badge, parallax,
// reveal-on-scroll) onto this same server-rendered markup from the client.
// `.lights-out` still keeps its pure-CSS 5s fallback fade (home.css) in
// case JS fails to load.
export default function Home() {
  return (
    <div className="home-page">
      <HomeMotion />
      <div className="lights-out" id="voltLightsOut" aria-hidden="true">
        <div className="lights-out__panel">
          <div className="lights-out__sign">
            <img src="/images-brand/logof1-clean.png" alt="" />
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div className="lights-out__col" key={i}>
              <span className="lights-out__light" />
              <span className="lights-out__light lights-out__light--red" />
            </div>
          ))}
        </div>
        <p className="lights-out__phrase">Lights out and away we go...</p>
      </div>

      <div className="page-grid" aria-hidden="true" />

      <div className="page-shell">
        <main>
          <section className="hero" id="top" aria-label="Principal">
            <span className="hero__watermark" aria-hidden="true">
              VOLT
            </span>
            <div className="hero__badge">
              <span className="hero__pulse" aria-hidden="true" />
              <span>Córdoba, Argentina · Est. 2025</span>
            </div>
            <h1 className="hero__headline">
              BUILT FOR THE <span className="accent">FAST LANE</span>
            </h1>
            <p className="hero__sub">Velocidad es cultura</p>
            <div className="hero__ctas">
              <a className="btn btn--fill hero__shop-btn" href="/catalogo">
                VER TIENDA
              </a>
              <a className="btn" href="#about">
                Nuestro Manifiesto →
              </a>
            </div>
            <FeaturedCarousel />
            <div className="hero__scroll" aria-hidden="true">
              <span className="hero__scroll-line" />
              <span>deslizá</span>
            </div>
          </section>

          <div className="ticker" aria-hidden="true">
            <div className="ticker__track">
              <div className="ticker__group">
                <span className="ticker__item">VOLT Culture</span>
                <span className="ticker__dot" />
                <span className="ticker__item">Córdoba, Argentina</span>
                <span className="ticker__dot" />
                <span className="ticker__item">Diseño Propio · CBA, ARG</span>
                <span className="ticker__dot" />
                <span className="ticker__item">STREETWEAR DE CIRCUITO</span>
                <span className="ticker__dot" />
                <span className="ticker__item">BUILT FOR THE FAST LANE</span>
                <span className="ticker__dot" />
                <span className="ticker__item">Velocidad es Cultura</span>
                <span className="ticker__dot" />
                <span className="ticker__item">voltculture.com.ar</span>
                <span className="ticker__dot" />
              </div>
              <div className="ticker__group" aria-hidden="true">
                <span className="ticker__item">VOLT Culture</span>
                <span className="ticker__dot" />
                <span className="ticker__item">Córdoba, Argentina</span>
                <span className="ticker__dot" />
                <span className="ticker__item">Diseño Propio · CBA, ARG</span>
                <span className="ticker__dot" />
                <span className="ticker__item">STREETWEAR DE CIRCUITO</span>
                <span className="ticker__dot" />
                <span className="ticker__item">BUILT FOR THE FAST LANE</span>
                <span className="ticker__dot" />
                <span className="ticker__item">Velocidad es Cultura</span>
                <span className="ticker__dot" />
                <span className="ticker__item">voltculture.com.ar</span>
                <span className="ticker__dot" />
              </div>
            </div>
          </div>

          <section className="identity" id="identity" aria-labelledby="identity-heading">
            <p className="section-label reveal" id="identity-heading">
              / 002 — IDENTIDAD
            </p>
            <div className="identity__grid">
              <article className="identity__card reveal">
                <p className="identity__num">01</p>
                <svg
                  className="identity__icon"
                  viewBox="0 0 40 40"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth={1.5} />
                  <circle cx="20" cy="20" r="4" fill="currentColor" />
                  <path d="M20 6V12M20 28V34M6 20H12M28 20H34" stroke="currentColor" strokeWidth={1.5} />
                </svg>
                <h2 className="identity__title">Precisión</h2>
                <p className="identity__desc">
                  Alineación tipo pit lane: cortes, gráfica y construcción medidos al milímetro. Nada sobra en
                  circuito.
                </p>
              </article>
              <article className="identity__card reveal">
                <p className="identity__num">02</p>
                <svg
                  className="identity__icon"
                  viewBox="0 0 40 40"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path d="M8 12H32V28H8V12Z" stroke="currentColor" strokeWidth={1.5} />
                  <path d="M8 18H32M8 22H32M14 12V28M20 12V28M26 12V28" stroke="currentColor" strokeWidth={1.5} />
                </svg>
                <h2 className="identity__title">Estructura</h2>
                <p className="identity__desc">
                  Jerarquía clara, bloques definidos. La pieza responde a reglas de paddock: orden bajo tensión.
                </p>
              </article>
              <article className="identity__card reveal">
                <p className="identity__num">03</p>
                <svg
                  className="identity__icon"
                  viewBox="0 0 40 40"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path d="M8 28L16 12L24 20L32 8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" />
                  <path d="M10 32H34" stroke="currentColor" strokeWidth={1.5} />
                </svg>
                <h2 className="identity__title">Velocidad</h2>
                <p className="identity__desc">
                  Lectura instantánea en movimiento. Pensado para quienes persiguen la milésima perfecta en el
                  cronómetro.
                </p>
              </article>
            </div>
          </section>

          <section className="drop" id="drop" aria-labelledby="drop-heading">
            <p className="section-label reveal">/ 003 — COLECCIÓN</p>
            <div className="drop__split reveal">
              <div className="drop__visual">
                <img
                  src="/images-brand/maxfuk.jpg"
                  alt="Identidad VOLT — Colección 01"
                  width={1200}
                  height={1400}
                  loading="lazy"
                  decoding="async"
                />
                <p className="drop__tag">/// VOLT CULTURE ///</p>
              </div>
              <div className="drop__content">
                <p className="drop__meta">COLECCIÓN 01 / DISEÑO PROPIO / CBA, ARG</p>
                <h2 className="drop__title" id="drop-heading">
                  IDENTIDAD VOLT
                </h2>
                <p className="drop__copy">
                  Volúmenes de calle con lectura racing. Telas y siluetas pensadas para transición
                  paddock–asfalto. Diseño 100% propio desde Córdoba. Unidades limitadas, sin reposición en
                  caliente. Registrate para ser el primero en enterarte.
                </p>
                <a className="btn btn--fill" href="/catalogo">
                  VER COLECCIÓN →
                </a>
              </div>
            </div>
          </section>

          <section className="manifesto" id="about" aria-labelledby="manifesto-heading">
            <p className="section-label reveal">/ 004 — MANIFIESTO</p>
            <h2 className="manifesto__quote reveal" id="manifesto-heading">
              No hacemos ropa. Hacemos <span className="accent">equipamiento</span> para quienes viven al{" "}
              <span className="accent">límite del crono.</span>
            </h2>
            <p className="manifesto__sub reveal">Córdoba, Argentina · Est. 2025 · voltculture.com.ar</p>
            <a className="btn btn--fill reveal" href="/catalogo">
              Ver tienda →
            </a>
          </section>
        </main>

        <div className="kerb" aria-hidden="true" />
      </div>
    </div>
  );
}
