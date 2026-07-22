import type { Metadata } from "next";

// legacy/pages/pending.html <meta name="robots" content="noindex, nofollow">
export const metadata: Metadata = {
    title: "VOLT | Pago pendiente",
    robots: { index: false, follow: false },
};

// Ver comentario en app/success/page.tsx sobre el path exacto de back_urls
// (`/pages/pending.html`) y el redirect 308 en next.config.ts.
type SearchParams = Promise<{ order?: string | string[] }>;

export default async function PendingPage({
    searchParams,
}: {
    searchParams: SearchParams;
}) {
    const { order } = await searchParams;
    const orderId = Array.isArray(order) ? order[0] : order;

    return (
        <main id="main-content" className="result-page">
            <div className="result-box result-pending">
                <span className="result-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path
                            d="M6 3h12M6 21h12M7 3c0 4 3 6.3 5 8-2 1.7-5 4-5 8m10-16c0 4-3 6.3-5 8 2 1.7 5 4 5 8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </span>
                <h1 className="result-heading">
                    Pago <span className="accent">en proceso</span>
                </h1>
                <p className="result-order">
                    Orden <span>{orderId || "—"}</span>
                </p>
                <p className="result-body">
                    Tu pago está siendo procesado. Te avisamos por mail y WhatsApp cuando se confirme.
                </p>
                <hr className="result-divider" />
                <div className="result-actions">
                    <a href="/mis-pedidos" className="btn-result-primary">
                        Ver mis pedidos
                    </a>
                    <a href="/catalogo" className="btn-result-ghost">
                        Volver al catálogo
                    </a>
                </div>
            </div>
        </main>
    );
}
