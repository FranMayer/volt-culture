/**
 * Template + helpers para páginas de producto (SEO). Funciones puras, testeables.
 */

export function slugify(name) {
    return String(name || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'producto';
}

export function productPath(product) {
    return `/producto/${slugify(product.name)}-${product.id}.html`;
}

function toAbsolute(url, siteUrl) {
    const u = String(url || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    return siteUrl.replace(/\/$/, '') + '/' + u.replace(/^\//, '');
}

export function buildImageArray(product, siteUrl) {
    const out = [];
    const push = (v) => {
        const abs = toAbsolute(v, siteUrl);
        if (abs && !out.includes(abs)) out.push(abs);
    };
    push(product.image || product.imageUrl);
    if (Array.isArray(product.images)) {
        for (const img of product.images) {
            if (typeof img === 'string') push(img);
            else if (img && typeof img === 'object') push(img.url || img.src);
        }
    }
    for (const map of [product.variantImages, product.imagesByColor]) {
        if (map && typeof map === 'object') {
            for (const v of Object.values(map)) {
                if (typeof v === 'string') push(v);
                else if (v && typeof v === 'object') push(v.url || v.src);
            }
        }
    }
    return out;
}

const STATIC_URLS = [
    { loc: '/', changefreq: 'weekly', priority: '1.0' },
    { loc: '/pages/catalogo.html', changefreq: 'daily', priority: '0.95' },
    { loc: '/pages/about.html', changefreq: 'monthly', priority: '0.7' },
    { loc: '/pages/envios.html', changefreq: 'monthly', priority: '0.75' },
    { loc: '/pages/novedades.html', changefreq: 'weekly', priority: '0.65' }
];

export function buildSitemap(products, siteUrl) {
    const base = siteUrl.replace(/\/$/, '');
    const entry = (loc, cf, pr) =>
        `  <url>\n    <loc>${base}${loc}</loc>\n    <changefreq>${cf}</changefreq>\n    <priority>${pr}</priority>\n  </url>`;
    const urls = STATIC_URLS.map((u) => entry(u.loc, u.changefreq, u.priority));
    for (const p of products) urls.push(entry(productPath(p), 'weekly', '0.8'));
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
