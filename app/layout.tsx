import type { Metadata } from "next";
import { Teko, DM_Mono } from "next/font/google";

// Cascade order replicates legacy exactly (see legacy/pages/catalogo.html):
// theme vars first (so aliases are available to what follows) -> bootstrap
// replacement (bs-shim, in the slot the old Bootstrap <link> occupied) ->
// style.css -> mediaquery.css -> volt-ds.css.
import "./styles/theme.css";
import "./styles/bs-shim.css";
import "./styles/style.css";
import "./styles/mediaquery.css";
import "./styles/volt-ds.css";
import "./styles/offcanvas.css";
import "./styles/modal.css";

import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import WhatsAppFloat from "@/components/layout/WhatsAppFloat";
import CartOffcanvas from "@/components/layout/CartOffcanvas";
import { CartOffcanvasProvider } from "@/components/layout/CartOffcanvasContext";
import { AuthProvider } from "@/components/auth/AuthProvider";
import AuthModal from "@/components/auth/AuthModal";
import AdminAccessEasterEgg from "@/components/auth/AdminAccessEasterEgg";

// Self-hosted, no external font CDN (replaces the old Google Fonts <link>
// and eliminates fonts.googleapis.com/fonts.gstatic.com from the CSP).
// The literal family names below ("Teko", "DM Mono") match what the ported
// CSS (theme.css alias chain -> style.css/volt-ds.css) already references
// via --font-heading/--font-ds-display/--font-ds-mono, so next/font's
// injected @font-face resolves those `font-family` declarations without
// touching a single line of the ported CSS.
const teko = Teko({
  weight: "700",
  subsets: ["latin"],
  variable: "--font-teko",
  display: "swap",
});

const dmMono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-dm-mono",
  display: "swap",
});

// "Glacial Indifference" is self-hosted via verbatim @font-face rules
// ported inside style.css/volt-ds.css (pointing at these .otf files) — no
// next/font registration needed here since nothing consumes a CSS var for
// it; registering it too would just duplicate the font download.
export const metadata: Metadata = {
  title: "VOLT Culture",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${teko.variable} ${dmMono.variable}`}
    >
      <body>
        <AuthProvider>
          <CartOffcanvasProvider>
            <Navbar />
            {children}
            <Footer />
            <WhatsAppFloat />
            <CartOffcanvas />
            <AuthModal />
            <AdminAccessEasterEgg />
          </CartOffcanvasProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
