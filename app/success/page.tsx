import type { Metadata } from "next";
import ClearCartOnSuccess from "@/components/order-result/ClearCartOnSuccess";

// legacy/pages/success.html <meta name="robots" content="noindex, nofollow">
export const metadata: Metadata = {
    title: "VOLT | Compra confirmada",
    robots: { index: false, follow: false },
};

// El path de esta ruta ("/success") es nuevo/limpio a propósito — el path
// EXACTO que manda create-preference.js en `back_urls.success` sigue siendo
// `/pages/success.html?order=...` (no se tocó ese endpoint, fuera de scope
// acá). El redirect 308 en next.config.ts cubre ese path para todas las
// preferencias, viejas y nuevas, mientras create-preference.js no cambie.
type SearchParams = Promise<{ order?: string | string[] }>;

export default async function SuccessPage({
    searchParams,
}: {
    searchParams: SearchParams;
}) {
    const { order } = await searchParams;
    const orderId = Array.isArray(order) ? order[0] : order;

    return (
        <main id="main-content" className="result-page">
            <div className="result-box result-success">
                <span className="result-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M12 2a10 10 0 100 20 10 10 0 000-20zm4.7 7.7l-5.4 5.4a1 1 0 01-1.42 0l-2.6-2.6a1 1 0 111.42-1.4l1.9 1.88 4.68-4.68a1 1 0 111.42 1.4z"
                        />
                    </svg>
                </span>
                <h1 className="result-heading">
                    Compra <span className="accent">confirmada</span>
                </h1>
                <p className="result-order">
                    Orden <span>{orderId || "—"}</span>
                </p>
                <p className="result-body">
                    Tu pedido fue recibido. Te avisamos por mail y WhatsApp cuando esté en camino.
                </p>
                <hr className="result-divider" />
                <div className="result-actions">
                    <a href="/mis-pedidos" className="btn-result-primary">
                        Ver mis pedidos
                    </a>
                    <a href="/catalogo" className="btn-result-ghost">
                        Seguir comprando
                    </a>
                </div>
            </div>
            <ClearCartOnSuccess />
        </main>
    );
}
