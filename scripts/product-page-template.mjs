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

function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function aggregateStock(product) {
    const v = Array.isArray(product.variants) ? product.variants.reduce((n, x) => n + (Number(x.stock) || 0), 0) : 0;
    const s = Array.isArray(product.sizes) ? product.sizes.reduce((n, x) => n + (Number(x.stock) || 0), 0) : 0;
    if (v > 0) return v;
    if (s > 0) return s;
    return Number(product.stock) || 0;
}

export function renderProductPage(product, { siteUrl }) {
    const base = siteUrl.replace(/\/$/, '');
    const url = base + productPath(product);
    const images = buildImageArray(product, siteUrl);
    const mainImage = images[0] || `${base}/images-brand/Isotipo color.png`;
    const price = Number(product.price) || 0;
    const inStock = aggregateStock(product) > 0;
    const desc = String(product.description
        || `${product.name} — VOLT Culture. Streetwear inspirado en el motorsport, desde Córdoba.`).trim();

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name || 'Producto VOLT',
        description: desc,
        image: images.length ? images : [mainImage],
        sku: String(product.id),
        mpn: String(product.id),
        brand: { '@type': 'Brand', name: 'VOLT' },
        offers: {
            '@type': 'Offer',
            price: String(price),
            priceCurrency: 'ARS',
            availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            url
        }
    };

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(product.name)} · VOLT Culture</title>
<meta name="description" content="${esc(desc.slice(0, 160))}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="product">
<meta property="og:title" content="${esc(product.name)} · VOLT">
<meta property="og:description" content="${esc(desc.slice(0, 160))}">
<meta property="og:image" content="${esc(mainImage)}">
<meta property="og:url" content="${esc(url)}">
<link rel="icon" href="/images-brand/Isotipo color.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Teko:wght@700&display=swap" rel="stylesheet">
<link href="/css/volt-ds.css" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
<style>
  body{background:#000;color:#fff;font-family:'Glacial Indifference',sans-serif;margin:0}
  /* volt-ds pinta su grilla en body::before (fixed, z-index 0): el contenido
     debe posicionarse por encima, como en el resto de las páginas del sitio. */
  .pp-nav,.pp-wrap,.pp-foot{position:relative;z-index:1}
  .pp-nav{padding:.5rem 1.5rem;border-bottom:1px solid rgba(255,255,255,.1)}
  .pp-nav a{display:inline-block;line-height:0}
  .pp-nav img{height:88px;width:auto;display:block}
  .pp-wrap{max-width:960px;margin:0 auto;padding:2rem 1.5rem;display:grid;gap:2rem;grid-template-columns:1fr}
  @media(min-width:768px){.pp-wrap{grid-template-columns:1fr 1fr}}
  .pp-img img{width:100%;height:auto;display:block;border:1px solid rgba(255,255,255,.08)}
  .pp-title{font-family:'Teko',sans-serif;font-size:2.5rem;line-height:1;text-transform:uppercase;margin:0 0 .5rem}
  .pp-price{font-size:1.5rem;color:#c1121f;font-weight:700;margin:0 0 1rem}
  .pp-desc{color:#bbb;line-height:1.6;margin:0 0 1.5rem}
  .pp-cta{display:inline-block;background:#c1121f;color:#fff;text-decoration:none;padding:.85rem 1.5rem;font-family:'Teko',sans-serif;font-size:1.3rem;letter-spacing:.06em}
  .pp-foot{padding:2rem 1.5rem;border-top:1px solid rgba(255,255,255,.1);color:#666;font-size:.8rem;text-align:center}
</style>
</head>
<body>
<nav class="pp-nav"><a href="/" aria-label="VOLT — Inicio"><img src="/images-brand/Logo color y blanco.svg" alt="VOLT — Motorsport Culture"></a></nav>
<main class="pp-wrap">
  <div class="pp-img"><img src="${esc(mainImage)}" alt="${esc(product.name)}"></div>
  <div class="pp-info">
    <h1 class="pp-title">${esc(product.name)}</h1>
    <p class="pp-price" data-pp-price>$${price.toLocaleString('es-AR')}</p>
    <p class="pp-desc">${esc(desc)}</p>
    <p data-pp-availability>${inStock ? 'En stock' : 'Sin stock'}</p>
    <a class="pp-cta" href="/pages/catalogo.html?product=${esc(product.id)}">Comprar &rarr;</a>
  </div>
</main>
<footer class="pp-foot">VOLT — Motorsport Culture · Córdoba, Argentina</footer>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
<script src="/js/firebase-config.js"></script>
<script>
  (function () {
    try {
      if (!window.FirebaseConfig || !window.FirebaseConfig.init()) return;
      firebase.firestore().collection('products').doc(${JSON.stringify(String(product.id)).replace(/</g, '\\u003c')}).get().then(function (snap) {
        if (!snap.exists) return;
        var d = snap.data();
        var priceEl = document.querySelector('[data-pp-price]');
        if (priceEl && Number(d.price)) priceEl.textContent = '$' + Number(d.price).toLocaleString('es-AR');
        var stock = 0;
        if (Array.isArray(d.variants)) stock = d.variants.reduce(function (n, x) { return n + (Number(x.stock) || 0); }, 0);
        if (!stock && Array.isArray(d.sizes)) stock = d.sizes.reduce(function (n, x) { return n + (Number(x.stock) || 0); }, 0);
        if (!stock) stock = Number(d.stock) || 0;
        var availEl = document.querySelector('[data-pp-availability]');
        if (availEl) availEl.textContent = stock > 0 ? 'En stock' : 'Sin stock';
      }).catch(function () {});
    } catch (e) {}
  })();
</script>
</body>
</html>`;
}
