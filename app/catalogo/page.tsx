import { Suspense } from "react";
import type { Metadata } from "next";
import CatalogView from "@/components/catalog/CatalogView";

// Metadata ported from legacy/pages/catalogo.html <head> (title/description).
// OG/JSON-LD/canonical parity is deferred: F5 formalizes generateMetadata
// per-route conventions and this page can follow the same pattern then.
export const metadata: Metadata = {
  title: "Tienda VOLT | Streetwear F1 y motorsport — Comprá online | Argentina",
  description:
    "Shop VOLT: remeras, buzos y streetwear motorsport y F1. Talles, colores y pago con Mercado Pago. Envíos a todo Argentina.",
};

// CatalogView uses useSearchParams() (deep-link `?product=`, `?line=`/`?cat=`
// filters) — App Router requires a Suspense boundary around any component
// that calls it during prerendering, or `next build` fails.
export default function CatalogoPage() {
  return (
    <Suspense fallback={null}>
      <CatalogView />
    </Suspense>
  );
}
