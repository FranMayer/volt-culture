import type { Metadata } from "next";
import RevealOnScroll from "@/components/RevealOnScroll";

// Metadata ported from legacy/pages/envios.html <head> (title/description).
export const metadata: Metadata = {
  title: "Envíos VOLT | Córdoba $2.500, Andreani / OCA y tiempos de entrega | Argentina",
  description:
    "Envíos VOLT: $2.500 en Córdoba Capital, Andreani u OCA al interior. Plazos, Mercado Pago y coordinación por WhatsApp.",
};

// Ported almost verbatim from legacy/pages/envios.html's <main id="main-content">.
// Navbar/Footer/WhatsApp float come from app/layout.tsx — not duplicated here.
//
// The legacy page's `.icon`/`.howbuy__step-icon` glyphs were Bootstrap Icons
// (`bi bi-*`, loaded from a CDN <link> not carried over into this migration —
// see components/checkout order-result pages for the same precedent). Swapped
// 1:1 for inline Lucide-style SVGs (stroke, currentColor) sized to match the
// `.icon`/`.howbuy__step-icon` font-size the ported CSS still applies to the
// container, so color/size parity holds even though the glyph source changed.
export default function EnviosPage() {
  return (
    <main id="main-content">
      <RevealOnScroll />
      <section className="envios__main" aria-labelledby="envios-page-title">
        <div className="container">
          <div className="envios-page__header volt-glow">
            <span className="volt-watermark" aria-hidden="true">
              ENVÍOS
            </span>
            <h1 id="envios-page-title" className="envios-page__title">
              Envíos y entregas
            </h1>
            <p className="envios-page__lead">
              Córdoba $2.500 · Andreani / OCA al interior · Coordinación por WhatsApp
            </p>
          </div>
          <div className="card reveal">
            <div className="icon">
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <h2>Córdoba Capital — $2.500</h2>
            <p>
              Si estás en Córdoba Capital, el envío tiene un costo fijo de $2.500. Coordinamos el
              punto y horario de entrega directamente por WhatsApp.
            </p>
            <a
              href="https://wa.me/5493518588127?text=Hola!%20Quiero%20coordinar%20la%20entrega%20de%20mi%20pedido%20VOLT"
              target="_blank"
              rel="noopener"
              className="btn envios-card__cta"
            >
              Coordinar por WhatsApp
            </a>
          </div>

          <div className="card reveal">
            <div className="icon">
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
                <path d="M15 18H9" />
                <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
                <circle cx="17" cy="18" r="2" />
                <circle cx="7" cy="18" r="2" />
              </svg>
            </div>
            <h2>Interior del País — Andreani / OCA</h2>
            <p>
              Para el resto de Argentina, los envíos se realizan a través de Andreani u OCA según
              tu localidad. El costo se calcula según destino y se coordina por WhatsApp antes del
              despacho.
            </p>
          </div>

          <div className="card reveal">
            <div className="icon">
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h2>Tiempo de despacho</h2>
            <p>
              El pedido se despacha <strong>una vez confirmado el pago</strong>. Te avisamos por
              mail y WhatsApp cuando esté en camino.
            </p>
          </div>

          <div className="card reveal">
            <div className="icon">
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </div>
            <h2>Cambios y devoluciones</h2>
            <p>
              Escribinos a <a href="mailto:volt.streetcba@gmail.com">volt.streetcba@gmail.com</a>{" "}
              dentro de los 7 días de recibido el pedido.
            </p>
          </div>
        </div>
      </section>

      <section className="howbuy__main reveal">
        <h2>¿Cómo comprar?</h2>

        <div className="howbuy__steps">
          <div className="howbuy__step">
            <span className="howbuy__step-icon" aria-hidden="true">
              <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <path d="M3 6h18" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </span>
            <div>
              <strong>1. Elegí tus productos</strong>
              <p className="howbuy__step-text">
                Explorá el catálogo, seleccioná talle y color, y agregá al carrito.
              </p>
            </div>
          </div>
          <div className="howbuy__step">
            <span className="howbuy__step-icon" aria-hidden="true">
              <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width={8} height={4} x={8} y={2} rx={1} ry={1} />
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <path d="m9 14 2 2 4-4" />
              </svg>
            </span>
            <div>
              <strong>2. Completá tus datos</strong>
              <p className="howbuy__step-text">
                Ingresá tu nombre, dirección y datos de contacto para el envío.
              </p>
            </div>
          </div>
          <div className="howbuy__step">
            <span className="howbuy__step-icon" aria-hidden="true">
              <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width={20} height={14} x={2} y={5} rx={2} />
                <line x1={2} x2={22} y1={10} y2={10} />
              </svg>
            </span>
            <div>
              <strong>3. Elegí cómo pagar</strong>
              <p className="howbuy__step-text">
                Pagá con Mercado Pago (tarjeta, débito y más) o por transferencia bancaria con un
                10% de descuento.
              </p>
            </div>
          </div>
          <div className="howbuy__step">
            <span className="howbuy__step-icon" aria-hidden="true">
              <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73Z" />
                <path d="M12 22V12" />
                <polyline points="3.29 7 12 12 20.71 7" />
                <path d="m7.5 4.27 9 5.15" />
              </svg>
            </span>
            <div>
              <strong>4. Recibí tu pedido</strong>
              <p className="howbuy__step-text">
                Te avisamos cuando tu pedido esté en camino. En Córdoba coordinamos la entrega por
                WhatsApp; al interior va por Andreani.
              </p>
            </div>
          </div>
        </div>

        <p className="howbuy__cta-wrap">
          <a href="/catalogo" className="btn">
            Ver catálogo
          </a>
        </p>
      </section>
    </main>
  );
}
