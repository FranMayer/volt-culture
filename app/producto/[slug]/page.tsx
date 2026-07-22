import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { cache } from "react";
import { getById } from "@/lib/products";
import { adminDb } from "@/lib/firebase/admin";
import { buildImageArray, productPath, slugify, totalStock } from "@/lib/catalog-helpers";
import type { Product } from "@/lib/types";
import ProductDetail from "@/components/catalog/ProductDetail";
import "@/app/styles/product-page.css";

// ISR: cada producto se revalida como máximo cada hora; on-demand revalidate
// (Tarea 2 de F5) lo dispara antes cuando el admin edita un producto.
export const revalidate = 3600;
// Riesgo explícito del plan (línea 87): el build puede correr sin FIREBASE_*
// configuradas — generateStaticParams degrada a `[]` (ver más abajo) y
// dynamicParams=true deja que cualquier slug se sirva on-demand igual.
export const dynamicParams = true;

type Params = { slug: string };

function siteUrl(): string {
  return (process.env.SITE_URL || "https://www.voltculture.com.ar").replace(/\/$/, "");
}

// Los ids de Firestore (autogenerados) no contienen "-": el id de producto es
// todo lo que sigue al ÚLTIMO guion del slug `${slugify(name)}-${id}`.
function idFromSlug(slug: string): string {
  const idx = slug.lastIndexOf("-");
  return idx === -1 ? slug : slug.slice(idx + 1);
}

// cache() dedupea la lectura entre generateMetadata y el render de la página
// dentro del mismo request/build de esta ruta (misma instancia de Product,
// una sola ida a Firestore).
const loadProduct = cache((id: string) => getById(id));

export async function generateStaticParams(): Promise<Params[]> {
  try {
    const snap = await adminDb().collection("products").where("active", "==", true).get();
    return snap.docs.map((d) => ({ slug: `${slugify((d.data() as { name?: string }).name)}-${d.id}` }));
  } catch {
    // Sin FIREBASE_* (o Firestore caído) en tiempo de build: no aborta el
    // build del resto del sitio, ninguna página de producto se prerrenderiza
    // y dynamicParams=true las sirve on-demand la primera vez que se piden.
    return [];
  }
}

function buildSeo(product: Product) {
  const base = siteUrl();
  const url = `${base}${productPath(product)}`;
  const images = buildImageArray(product, base);
  const mainImage = images[0] || `${base}/images-brand/Isotipo color.png`;
  const desc = String(
    product.description || `${product.name} — VOLT Culture. Streetwear inspirado en el motorsport, desde Córdoba.`
  ).trim();
  return { base, url, images, mainImage, desc };
}

// Metadata idéntica a la que emitía scripts/product-page-template.mjs
// (renderProductPage): title, description (160 chars), canonical. Ese script
// no se migra (CLAUDE.md "Qué NO migrar"); acá se replica su salida exacta.
//
// Los tags og:* NO se generan acá: el `openGraph.type` de next's Metadata
// API es un union cerrado (website/article/book/profile/music.*/video.*) con
// un switch exhaustivo en next/dist/lib/metadata/generate/opengraph — pasar
// "product" (lo que emite el legacy, og:type=product es el valor estándar de
// schema.org/OG para productos) tira `Invalid OpenGraph type` en runtime, no
// solo en TS. Los og:* se renderizan a mano en el body de la página (ver
// default export): React/Next hoistea <meta>/<title>/<link> renderizados en
// cualquier punto del árbol al <head> del documento, mismo mecanismo que ya
// usan los dos <script type="application/ld+json"> de esta misma página.
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(idFromSlug(slug));
  if (!product) return {};

  const { url, desc } = buildSeo(product);
  const shortDesc = desc.slice(0, 160);

  return {
    title: `${product.name} · VOLT Culture`,
    description: shortDesc,
    alternates: { canonical: url },
  };
}

export default async function ProductPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const product = await loadProduct(idFromSlug(slug));
  // getById no filtra `active` (a diferencia de generateStaticParams): un
  // producto soft-deleted (remove() en lib/products.ts) sigue resolviendo acá
  // vía dynamicParams=true. Mismo resultado que el .html borrado en el sitio
  // viejo: 404.
  if (!product || product.active === false) notFound();

  // Slug no canónico (nombre editado, o link viejo): 308 al slug actual —
  // mismo criterio SEO que el resto del sitio.
  const canonicalSlug = `${slugify(product.name)}-${product.id}`;
  if (slug !== canonicalSlug) permanentRedirect(productPath(product));

  const { base, url, images, mainImage, desc } = buildSeo(product);
  const inStock = totalStock(product) > 0;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name || "Producto VOLT",
    description: desc,
    image: images.length ? images : [mainImage],
    sku: String(product.id),
    mpn: String(product.id),
    brand: { "@type": "Brand", name: "VOLT" },
    offers: {
      "@type": "Offer",
      price: String(Number(product.price) || 0),
      priceCurrency: "ARS",
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url,
    },
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: `${base}/` },
      // legacy apuntaba a /pages/catalogo.html; F4 ya sirve /catalogo.
      { "@type": "ListItem", position: 2, name: "Catálogo", item: `${base}/catalogo` },
      { "@type": "ListItem", position: 3, name: product.name || "Producto", item: url },
    ],
  };

  // Whitelist (no blacklist) de los campos que ProductDetail y los helpers de
  // lib/catalog-helpers.js que consume realmente leen de `product`. `product`
  // puede traer campos Timestamp de Firestore (createdAt/updatedAt/deletedAt
  // en soft-deletes) que son instancias de clase, no plain objects: cruzar el
  // límite Server -> Client ("use client" en ProductDetail) con cualquiera de
  // ellos revienta con "Only plain objects can be passed to Client
  // Components". Whitelistear en vez de strippear timestamps puntuales mata
  // la clase de bug entera, no solo el campo que la disparó.
  const productForClient: Product = {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    stock: product.stock,
    category: product.category,
    image: product.image,
    images: product.images,
    variantImages: product.variantImages,
    imagesByColor: product.imagesByColor,
    variants: product.variants,
    sizes: product.sizes,
    active: product.active,
  };

  const shortDesc = desc.slice(0, 160);

  return (
    <main id="main-content">
      {/* og:* a mano — ver el comentario en generateMetadata. Mismos 5 tags
          y mismo contenido que scripts/product-page-template.mjs. */}
      <meta property="og:type" content="product" />
      <meta property="og:title" content={`${product.name} · VOLT`} />
      <meta property="og:description" content={shortDesc} />
      <meta property="og:image" content={mainImage} />
      <meta property="og:url" content={url} />
      {/* Mismo escape que product-page-template.mjs: evita que un nombre de
          producto con "</script>" rompa el documento (XSS). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, "\\u003c") }}
      />
      <ProductDetail product={productForClient} />
    </main>
  );
}
