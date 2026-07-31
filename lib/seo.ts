import type { Metadata } from "next";

// Única fuente del origen público del sitio. Estaba duplicada literal en
// app/sitemap.ts, app/robots.ts y app/producto/[slug]/page.tsx.
export function siteUrl(): string {
  return (process.env.SITE_URL || "https://www.voltculture.com.ar").replace(/\/$/, "");
}

// app/opengraph-image.png (convención de archivo del App Router): el logo
// VOLT sobre negro, 1200x630, generado desde
// public/images-brand/Logo color y blanco.png.
//
// Se referencia explícito en vez de confiar solo en la convención porque Next
// REEMPLAZA el objeto `openGraph` entero cuando un segmento hijo lo define
// (node_modules/next/dist/lib/metadata/resolve-metadata.js, `case 'openGraph'`),
// y la imagen que la convención inyecta lo hace a nivel del layout raíz: sin
// esto, toda página que setea su propio openGraph se quedaría sin og:image.
const OG_IMAGE = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: "VOLT — MotorSport Culture",
};

/**
 * Metadata compartida de una página indexable: canonical + Open Graph, ambos
 * con URL absoluta.
 *
 * `path` va con "/" inicial ("/catalogo"; "/" para el home). Tanto canonical
 * como og:url tienen que declararse por página y no heredarse del layout
 * raíz: heredarlos haría que todas las rutas declaren el home como canónico,
 * que es bastante peor que no tener canonical.
 *
 * twitter:* no se setea acá — el layout raíz declara card/site una sola vez y
 * Next autocompleta twitter:title/description/image desde este openGraph.
 */
export function pageMetadata({
  path,
  title,
  description,
}: {
  path: string;
  title: string;
  description: string;
}): Metadata {
  const url = `${siteUrl()}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: "VOLT Culture",
      locale: "es_AR",
      url,
      title,
      description,
      images: [OG_IMAGE],
    },
  };
}
