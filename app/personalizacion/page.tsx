import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import RevealOnScroll from "@/components/RevealOnScroll";

export const metadata: Metadata = pageMetadata({
  path: "/personalizacion",
  title: "Prendas personalizadas VOLT | Buzos y remeras DTF con diseños de automovilismo",
  description:
    "Personalizá buzos y remeras 100% algodón con DTF textil y diseños de automovilismo de cualquier categoría. Sin mínimo de unidades, entrega en una semana, cotización por WhatsApp.",
});

// ponytail: reusa tal cual el markup/CSS de app/envios/page.tsx (`envios__main`,
// `.card`, `.howbuy__steps`) — es la misma página estática de contenido, así que
// cero CSS nuevo. Si algún día divergen visualmente, ahí se separan las clases.
const WA_LINK =
  "https://wa.me/5493518588127?text=" +
  encodeURIComponent("Hola! Quiero cotizar una prenda personalizada VOLT");

export default function PersonalizacionPage() {
  return (
    <main id="main-content">
      <RevealOnScroll />
      <section className="envios__main" aria-labelledby="personalizacion-page-title">
        <div className="container">
          <div className="envios-page__header volt-glow">
            <span className="volt-watermark" aria-hidden="true">
              PERSONALIZÁ
            </span>
            <h1 id="personalizacion-page-title" className="envios-page__title">
              Prendas personalizadas
            </h1>
            {/* Bajada en prosa: reusa .news-page__intro (14px body, no
                uppercase) porque .envios-page__lead está forzado a mono 11px
                uppercase en volt-ds.css — sirve para el renglón de specs de
                abajo, no para una frase. */}
            <p className="news-page__intro personalizacion-page__hook">
              ¿Tenés un diseño en la cabeza? Bajalo a una prenda. Vos ponés la idea, nosotros el
              algodón y la tinta.
            </p>
            <p className="envios-page__lead">
              Buzos y remeras 100% algodón · DTF textil · Diseños de automovilismo
            </p>
          </div>

          <div className="card reveal">
            <div className="icon">
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
              </svg>
            </div>
            <h2>Qué se puede personalizar</h2>
            <p>
              Por ahora trabajamos sobre <strong>buzos y remeras 100% algodón</strong>. Elegís la
              prenda, el talle y el color base, y nosotros estampamos el diseño que quieras.
            </p>
          </div>

          <div className="card reveal">
            <div className="icon">
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" />
                <rect width={12} height={8} x={6} y={14} rx={1} />
              </svg>
            </div>
            <h2>DTF textil — full color</h2>
            <p>
              Estampamos con <strong>DTF textil</strong>: aguanta el lavado, no se cuartea y no
              tiene límite de colores, así que los degradados y las libreas completas salen tal cual
              el diseño. <strong>No hacemos bordado ni vinilo.</strong>
            </p>
          </div>

          <div className="card reveal">
            <div className="icon">
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 8 2a6 6 0 0 0 3.6-1.2A1 1 0 0 1 21 3.6V13a1 1 0 0 1-.4.8A6 6 0 0 1 17 15c-3 0-5-2-8-2a6 6 0 0 0-5 1.5" />
              </svg>
            </div>
            <h2>Diseños de automovilismo</h2>
            <p>
              Cualquier categoría: F1, MotoGP, TC, rally, resistencia, karting. Tu piloto, tu
              escudería, el auto de tu viejo o el número de tu equipo. Mandanos una imagen de
              referencia o contanos la idea y la bajamos a un arte.
            </p>
          </div>

          <div className="card reveal">
            <div className="icon">
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h2>Plazo y cantidades</h2>
            <p>
              El plazo estimado es de <strong>una semana</strong> desde que aprobás el arte.{" "}
              <strong>No hay mínimo de unidades</strong>: te hacemos una sola prenda o el pedido
              completo del equipo.
            </p>
          </div>

          <div className="card reveal">
            <div className="icon">
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
              </svg>
            </div>
            <h2>El precio se cotiza por WhatsApp</h2>
            <p>
              No hay un precio fijo publicado: depende de la prenda, del tamaño del estampado y de
              la cantidad. Escribinos con tu idea y te pasamos el presupuesto.
            </p>
            <a href={WA_LINK} target="_blank" rel="noopener" className="btn envios-card__cta">
              Cotizar por WhatsApp
            </a>
          </div>
        </div>
      </section>

      <section className="howbuy__main reveal">
        <h2>¿Cómo lo pedís?</h2>

        <div className="howbuy__steps">
          <div className="howbuy__step">
            <span className="howbuy__step-icon" aria-hidden="true">
              <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
              </svg>
            </span>
            <div>
              <strong>1. Elegí la prenda</strong>
              <p className="howbuy__step-text">
                Buzo o remera, 100% algodón. Decidí talle y color base.
              </p>
            </div>
          </div>
          <div className="howbuy__step">
            <span className="howbuy__step-icon" aria-hidden="true">
              <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width={18} height={18} x={3} y={3} rx={2} />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
            </span>
            <div>
              <strong>2. Mandanos tu idea</strong>
              <p className="howbuy__step-text">
                Por WhatsApp: una imagen de referencia, un logo o simplemente contanos qué querés.
              </p>
            </div>
          </div>
          <div className="howbuy__step">
            <span className="howbuy__step-icon" aria-hidden="true">
              <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
                <circle cx="7.5" cy="7.5" r="0.5" fill="currentColor" />
              </svg>
            </span>
            <div>
              <strong>3. Te pasamos el presupuesto</strong>
              <p className="howbuy__step-text">
                Cotización y arte final, para que le des el visto bueno antes de que entre a
                producción.
              </p>
            </div>
          </div>
          <div className="howbuy__step">
            <span className="howbuy__step-icon" aria-hidden="true">
              <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73Z" />
                <path d="M12 22V12" />
                <polyline points="3.29 7 12 12 20.71 7" />
              </svg>
            </span>
            <div>
              <strong>4. Producción y entrega</strong>
              <p className="howbuy__step-text">
                Una semana aproximadamente. Coordinamos entrega en Córdoba o envío al interior.
              </p>
            </div>
          </div>
        </div>

        <p className="howbuy__cta-wrap">
          <a href={WA_LINK} target="_blank" rel="noopener" className="btn">
            Cotizar por WhatsApp
          </a>
        </p>
      </section>
    </main>
  );
}
