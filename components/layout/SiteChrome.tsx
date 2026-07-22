"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";
import Footer from "./Footer";
import WhatsAppFloat from "./WhatsAppFloat";
import CartOffcanvas from "./CartOffcanvas";
import AuthModal from "@/components/auth/AuthModal";
import AdminAccessEasterEgg from "@/components/auth/AdminAccessEasterEgg";
import CheckoutModal from "@/components/checkout/CheckoutModal";
import TransferSuccessModal from "@/components/checkout/TransferSuccessModal";

/**
 * Envuelve el chrome público del sitio (navbar/footer/whatsapp/cart+auth+
 * checkout modals) y lo oculta en `/admin`. legacy/admin/panel.html es una
 * página standalone sin nada de esto; el resto de las rutas SÍ comparten un
 * único app/layout.tsx (root layout), así que la exclusión se hace por
 * pathname en vez de layouts raíz paralelos (evitaría duplicar
 * html/body/providers para una sola ruta). Sigue dentro de AuthProvider/
 * CartOffcanvasProvider/CheckoutProvider (ver app/layout.tsx) — el panel
 * admin necesita useAuth() para su gate por claim.
 */
export default function SiteChrome({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isAdminRoute = pathname?.startsWith("/admin") ?? false;

    if (isAdminRoute) {
        return <>{children}</>;
    }

    return (
        <>
            <Navbar />
            {children}
            <Footer />
            <WhatsAppFloat />
            <CartOffcanvas />
            <AuthModal />
            <AdminAccessEasterEgg />
            <CheckoutModal />
            <TransferSuccessModal />
        </>
    );
}
