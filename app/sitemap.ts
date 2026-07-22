import type { MetadataRoute } from 'next';
import { getAll } from '@/lib/products';
import { productPath } from '@/lib/catalog-helpers';

function siteUrl(): string {
    return (process.env.SITE_URL || 'https://www.voltculture.com.ar').replace(/\/$/, '');
}

// Reemplaza legacy/sitemap.xml (estático). about/envios/novedades ya existen
// como rutas del App Router (F8) y se listan acá. mis-pedidos/success/pending/
// failure/admin se omiten a propósito: son privadas o transitorias, no páginas
// para indexar.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const base = siteUrl();

    const staticEntries: MetadataRoute.Sitemap = [
        { url: `${base}/`, changeFrequency: 'weekly', priority: 1.0 },
        { url: `${base}/catalogo`, changeFrequency: 'daily', priority: 0.95 },
        { url: `${base}/novedades`, changeFrequency: 'weekly', priority: 0.7 },
        { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.5 },
        { url: `${base}/envios`, changeFrequency: 'monthly', priority: 0.5 },
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
