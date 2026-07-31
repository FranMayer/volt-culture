import { Suspense } from "react";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import CatalogView from "@/components/catalog/CatalogView";

// title/description portados de legacy/pages/catalogo.html <head>; canonical +
// OG los agrega pageMetadata (lib/seo.ts).
export const metadata: Metadata = pageMetadata({
  path: "/catalogo",
  title: "Tienda VOLT | Streetwear F1 y motorsport — Comprá online | Argentina",
  description:
    "Shop VOLT: remeras, buzos y streetwear motorsport y F1. Talles, colores y pago con Mercado Pago. Envíos a todo Argentina.",
});

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
