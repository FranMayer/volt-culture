import type { Metadata } from "next";

// legacy/pages/failure.html <meta name="robots" content="noindex, nofollow">
export const metadata: Metadata = {
    title: "VOLT | Pago rechazado",
    robots: { index: false, follow: false },
};

// Ver comentario en app/success/page.tsx sobre el path exacto de back_urls
// (`/pages/failure.html`) y el redirect 308 en next.config.ts. El legacy no
// muestra el orderId en esta página (a diferencia de success/pending) — no
// hace falta leer searchParams acá.
export default function FailurePage() {
    return (
        <main id="main-content" className="result-page">
            <div className="result-box result-failure">
                <span className="result-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M12 2a10 10 0 100 20 10 10 0 000-20zm3.54 12.13a1 1 0 01-1.41 1.41L12 13.41l-2.13 2.13a1 1 0 01-1.41-1.41L10.59 12 8.46 9.87a1 1 0 011.41-1.41L12 10.59l2.13-2.13a1 1 0 011.41 1.41L13.41 12l2.13 2.13z"
                        />
                    </svg>
                </span>
                <h1 className="result-heading">
                    Pago <span className="accent">no completado</span>
                </h1>
                <p className="result-body">
                    Hubo un problema con el pago. Podés intentar de nuevo con otro método o
                    contactarnos si el problema persiste.
                </p>
                <hr className="result-divider" />
                <div className="result-actions">
                    <a href="/catalogo" className="btn-result-primary">
                        Intentar de nuevo
                    </a>
                    <a
                        href="https://wa.me/5493518588127?text=Hola!%20Tuve%20un%20problema%20con%20mi%20pago%20en%20VOLT"
                        target="_blank"
                        rel="noopener"
                        className="btn-result-ghost"
                    >
                        Contactar por WhatsApp
                    </a>
                </div>
            </div>
        </main>
    );
}
