import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';

// Reemplaza legacy/robots.txt (estático) — mismas reglas: allow all, disallow /admin/.
export default function robots(): MetadataRoute.Robots {
    const base = siteUrl();
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: '/admin/',
        },
        sitemap: `${base}/sitemap.xml`,
    };
}
