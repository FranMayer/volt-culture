import type { Metadata } from "next";
import RevealOnScroll from "@/components/RevealOnScroll";

// Metadata ported from legacy/pages/novedades.html <head> (title/description).
export const metadata: Metadata = {
  title: "Novedades VOLT | Drops, re-stock y streetwear motorsport",
  description:
    "Drops, re-stock y noticias de VOLT: streetwear F1 y motorsport. Enterate antes en @volt.culture y en esta página.",
};

// Ported almost verbatim from legacy/pages/novedades.html's <main id="main-content">.
// Navbar/Footer/WhatsApp float come from app/layout.tsx — not duplicated here.
// News card links to catalog stay as plain <a> (matches legacy's full page nav;
// query params like ?line=f1 are read by CatalogView's useSearchParams filter).
export default function NovedadesPage() {
  return (
    <main className="news-page" id="main-content">
      <RevealOnScroll />
      <header className="news-page__header section-panel volt-glow">
        <span className="volt-watermark" aria-hidden="true">
          NOVEDADES
        </span>
        <p className="section-eyebrow">Feed</p>
        <h1 className="news-page__title">Novedades</h1>
        <p className="news-page__intro">
          Drops, re-stock y avisos del equipo. Seguinos en{" "}
          <a href="https://www.instagram.com/volt.culture/" target="_blank" rel="noopener">
            @volt.culture
          </a>{" "}
          para enterarte primero.
        </p>
      </header>

      <div className="news-feed">
        <article className="news-card reveal">
          <a href="/catalogo?line=f1" className="news-card__media-link">
            <div className="news-card__media">
              <img
                src="/images-brand/colapinto.jpg"
                alt="Línea F1 de VOLT ya disponible"
                className="news-card__img"
                width={640}
                height={400}
                loading="lazy"
              />
              <span className="news-card__tag">DROP #02</span>
            </div>
          </a>
          <div className="news-card__body">
            <time className="news-card__date" dateTime="2026">
              2026
            </time>
            <h2 className="news-card__heading">
              <a href="/catalogo?line=f1">LÍNEA F1 — YA DISPONIBLE</a>
            </h2>
            <p className="news-card__excerpt">
              La velocidad de la Fórmula 1, en la calle. Nueva línea de VOLT, disponible ahora en
              la tienda.
            </p>
            <a href="/catalogo?line=f1" className="news-card__read">
              VER COLECCIÓN →
            </a>
          </div>
        </article>
        <article className="news-card reveal">
          <a href="/catalogo" className="news-card__media-link">
            <div className="news-card__media">
              <img
                src="/images-brand/tcverde.webp"
                alt="Línea TC de VOLT disponible en color verde"
                className="news-card__img"
                width={640}
                height={400}
                loading="lazy"
              />
              <span className="news-card__tag">DROP #01</span>
            </div>
          </a>
          <div className="news-card__body">
            <time className="news-card__date" dateTime="2026">
              2026
            </time>
            <h2 className="news-card__heading">
              <a href="/catalogo">LÍNEA TC — YA DISPONIBLE</a>
            </h2>
            <p className="news-card__excerpt">
              La primera línea de VOLT. Diseñada para los que viven a otro ritmo. Disponible ahora
              en la tienda.
            </p>
            <a href="/catalogo" className="news-card__read">
              VER COLECCIÓN →
            </a>
          </div>
        </article>
      </div>

      <section className="news-cta-bar reveal" aria-label="Acciones">
        <a href="/" className="btn btn-secondary">
          Inicio
        </a>
        <a href="/catalogo" className="btn">
          Tienda
        </a>
      </section>
    </main>
  );
}
