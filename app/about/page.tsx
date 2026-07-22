import type { Metadata } from "next";
import RevealOnScroll from "@/components/RevealOnScroll";

// Metadata ported from legacy/pages/about.html <head> (title/description).
// OG/JSON-LD/canonical parity is deferred to F5's generateMetadata pattern,
// same scope as app/catalogo/page.tsx.
export const metadata: Metadata = {
  title: "Nosotros VOLT | Historia, valores y streetwear motorsport | Córdoba",
  description:
    "VOLT nació en Córdoba: streetwear y cultura F1 / motorsport. Conocé la marca, el equipo y por qué hacemos ropa de racing para la calle.",
};

// Ported almost verbatim from legacy/pages/about.html's <main id="main-content">.
// Navbar/Footer/WhatsApp float come from app/layout.tsx — not duplicated here.
export default function AboutPage() {
  return (
    <main id="main-content">
      <RevealOnScroll />
      <header className="about-hero section-panel volt-glow">
        <span className="volt-watermark" aria-hidden="true">
          NOSOTROS
        </span>
        <div className="about-hero__grid" aria-hidden="true" />
        <img
          src="/images-brand/brand-elements/brutalism2.svg"
          alt=""
          className="volt-brand-bg volt-brand-bg--line about-hero__brand"
          width={300}
          height={300}
          aria-hidden="true"
        />
        <div className="about-hero__content reveal">
          <p className="section-eyebrow">Córdoba · Argentina</p>
          <h1 className="about-hero__title">Nosotros</h1>
          <div className="about-hero__rule" aria-hidden="true" />
          <p className="about-hero__lead">
            Streetwear con ADN de circuito: diseño, calidad y la misma pasión que sentís en la
            largada.
          </p>
        </div>
      </header>

      <section className="about-pillars" aria-labelledby="about-pillars-heading">
        <h2 id="about-pillars-heading" className="visually-hidden">
          Valores
        </h2>
        <div className="about-pillars__grid">
          <article className="about-pillar reveal">
            <svg
              className="about-pillar__icon"
              viewBox="0 0 56 56"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.2}
              aria-hidden="true"
            >
              <circle cx="28" cy="22" r="10" />
              <path d="M14 46c0-8 6-14 14-14s14 6 14 14" />
              <path d="M44 12l6-4M6 40l4-4" />
            </svg>
            <h3 className="about-pillar__title">Origen</h3>
            <p className="about-pillar__text">
              Nació en Córdoba, en el cruce entre la pista y la calle. VOLT es el resultado de
              años siguiendo carreras y buscando ropa que lo refleje.
            </p>
          </article>
          <article className="about-pillar reveal">
            <svg
              className="about-pillar__icon"
              viewBox="0 0 56 56"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.2}
              aria-hidden="true"
            >
              <path d="M8 36 L28 10 L48 36 Z" />
              <path d="M20 36 L28 22 L36 36" />
              <circle cx="28" cy="42" r="3" />
            </svg>
            <h3 className="about-pillar__title">Energía</h3>
            <p className="about-pillar__text">
              VOLT es velocidad y adrenalina en cada prenda, para quienes viven las carreras.
            </p>
          </article>
          <article className="about-pillar reveal">
            <svg
              className="about-pillar__icon"
              viewBox="0 0 56 56"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.2}
              aria-hidden="true"
            >
              <rect x="10" y="14" width="36" height="32" rx="2" />
              <path d="M18 22h20M18 30h14" />
              <path d="M22 38h12" />
            </svg>
            <h3 className="about-pillar__title">Calidad</h3>
            <p className="about-pillar__text">
              Materiales y procesos pensados para que dure: estética racing, construcción sólida.
            </p>
          </article>
          <article className="about-pillar reveal">
            <svg
              className="about-pillar__icon"
              viewBox="0 0 56 56"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.2}
              aria-hidden="true"
            >
              <path d="M28 8 L34 22 L48 24 L38 34 L40 48 L28 40 L16 48 L18 34 L8 24 L22 22 Z" />
            </svg>
            <h3 className="about-pillar__title">Comunidad</h3>
            <p className="about-pillar__text">
              Gracias por ser parte. Creamos para la tribuna que entiende cada curva.
            </p>
          </article>
        </div>
      </section>

      <section className="about-split about-split--reverse reveal-left" aria-labelledby="about-story-1">
        <div className="about-split__text">
          <p className="section-eyebrow">Historia</p>
          <h2 id="about-story-1" className="about-split__heading">
            De DRS a VOLT
          </h2>
          <div className="about-split__line" aria-hidden="true" />
          <p>
            VOLT nace de la evolución de DRS Store. En 2023 empezamos con indumentaria F1;
            buscábamos una marca que represente un estilo de vida: streetwear meets motorsport.
          </p>
        </div>
        <div className="about-split__visual">
          <div
            className="about-photo-placeholder"
            role="img"
            aria-label="Carrera de resistencia — referencia motorsport"
          >
            <img
              src="/images-brand/24horas.webp"
              alt="Carrera de resistencia, referencia de la evolución de DRS a VOLT"
              className="about-section-photo"
              width={800}
              height={600}
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
      </section>

      <section className="about-split reveal-right" aria-labelledby="about-story-2">
        <div className="about-split__visual">
          <div
            className="about-photo-placeholder"
            role="img"
            aria-label="Ayrton Senna — legado en pista"
          >
            <img
              src="/images-brand/Sennacubiertas.webp"
              alt="Ayrton Senna en pista, inspiración de la experiencia VOLT más allá de la compra"
              className="about-section-photo"
              width={800}
              height={600}
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
        <div className="about-split__text">
          <p className="section-eyebrow">Experiencia</p>
          <h2 id="about-story-2" className="about-split__heading">
            Más que una compra
          </h2>
          <div className="about-split__line" aria-hidden="true" />
          <p>
            Cada pedido lo procesamos con cuidado y rapidez. En VOLT no solo hay ropa: hay una
            comunidad que comparte el mismo fuego por el automovilismo.
          </p>
        </div>
      </section>
    </main>
  );
}
