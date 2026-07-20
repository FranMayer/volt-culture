import type { Metadata } from "next";
import { Teko, DM_Mono } from "next/font/google";
import localFont from "next/font/local";

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

import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import WhatsAppFloat from "@/components/layout/WhatsAppFloat";
import CartOffcanvas from "@/components/layout/CartOffcanvas";
import { CartOffcanvasProvider } from "@/components/layout/CartOffcanvasContext";

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

// "Glacial Indifference" is already self-hosted via verbatim @font-face
// rules ported inside style.css/volt-ds.css (pointing at these same .otf
// files), so this next/font/local registration doesn't change what the
// ported CSS renders — it only exposes a CSS var for future (F1b+) code
// and gives Next the chance to add its own preload/fallback-metrics.
const glacialIndifference = localFont({
  src: [
    {
      path: "../public/glacial-indifference/GlacialIndifference-Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/glacial-indifference/GlacialIndifference-Bold.otf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-glacial-indifference",
  display: "swap",
});

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
      className={`${teko.variable} ${dmMono.variable} ${glacialIndifference.variable}`}
    >
      <body>
        <CartOffcanvasProvider>
          <Navbar />
          {children}
          <Footer />
          <WhatsAppFloat />
          <CartOffcanvas />
        </CartOffcanvasProvider>
      </body>
    </html>
  );
}
