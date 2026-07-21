import type { MetadataRoute } from 'next';
import { getAll } from '@/lib/products';
import { productPath } from '@/lib/catalog-helpers';

function siteUrl(): string {
    return (process.env.SITE_URL || 'https://www.voltculture.com.ar').replace(/\/$/, '');
}

// Reemplaza legacy/sitemap.xml (estático). Las páginas de about/envios/novedades
// del legacy (`legacy/sitemap.xml`) todavía no tienen ruta en el App Router —
// migran en F8 — así que no se listan acá para no linkear URLs que hoy 404 en
// este sitio; se agregan cuando existan.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const base = siteUrl();

    const staticEntries: MetadataRoute.Sitemap = [
        { url: `${base}/`, changeFrequency: 'weekly', priority: 1.0 },
        { url: `${base}/catalogo`, changeFrequency: 'daily', priority: 0.95 },
    ];

    // Degradar sin romper: build/request sin FIREBASE_* (mismo criterio que
    // generateStaticParams de app/producto/[slug]/page.tsx) devuelve solo las
    // páginas estáticas en vez de tirar el sitemap entero.
    try {
        const products = await getAll();
        const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
            url: `${base}${productPath(product)}`,
            changeFrequency: 'weekly',
            priority: 0.8,
        }));
        return [...staticEntries, ...productEntries];
    } catch {
        return staticEntries;
    }
}
