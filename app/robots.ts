import type { MetadataRoute } from 'next';

function siteUrl(): string {
    return (process.env.SITE_URL || 'https://www.voltculture.com.ar').replace(/\/$/, '');
}

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
