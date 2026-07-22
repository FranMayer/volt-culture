/**
 * lib/catalog-helpers.js — lógica pura del catálogo (sin DOM/React), port de
 * legacy/js/catalog.js. Plain JS (no .ts), mismo patrón que lib/products-data.js
 * y lib/cart/reducer.js: sin dependencias de browser/Firestore, importable por
 * tests/catalog-helpers.test.mjs con `node` plano. components/catalog/* la
 * consume para render + selección de variantes.
 */

// =====================================================
// CATEGORÍAS FIJAS (misma lista que legacy/js/catalog.js:342-346)
// =====================================================
export const PRODUCTION_LINES = [
    { id: 'F1', label: 'Fórmula 1', available: true },
    { id: 'TC', label: 'Turismo Carretera (TC)', available: true },
];
export const ALL_CATEGORIES = ['Remeras', 'Buzos', 'Pantalones', 'Gorras'];

/** Producto tipo "hoodie" — legacy/js/catalog.js:105-109. */
export function isHoodieProduct(product) {
    const cat = String(product.category || '').toLowerCase();
    const name = String(product.name || '').toLowerCase();
    return cat === 'buzos' || name.includes('hoodie') || name.includes('buzo');
}

/** Etiqueta de tipo para la fila de precio — legacy/js/catalog.js:120-127. */
export function getProductTypeLabel(product) {
    if (isHoodieProduct(product)) return 'HOODIE';
    const cat = String(product.category || '').toLowerCase();
    if (cat.includes('remera')) return 'REMERA';
    if (cat.includes('gorra')) return 'GORRA';
    if (cat.includes('auto') || cat.includes('escala')) return 'ESCALA';
    return cat ? cat.replace(/s$/, '').toUpperCase() : '';
}

/** Galería de imágenes del producto (principal + `images[]`) — legacy:289-300. */
export function getProductGallery(product, fallbackImage) {
    const images = Array.isArray(product.images) ? product.images : [];
    const urls = images
        .map((img) => {
            if (typeof img === 'string') return img;
            if (img && typeof img === 'object') return img.url || img.src || '';
            return '';
        })
        .filter(Boolean);
    const main = product.image || fallbackImage;
    if (main && !urls.includes(main)) urls.unshift(main);
    return urls;
}

/** Imagen alternativa para un color (variantImages/imagesByColor) — legacy:302-309. */
export function getImageForColor(product, color) {
    if (!color) return '';
    const byColor = product.variantImages || product.imagesByColor || {};
    if (byColor && typeof byColor === 'object' && byColor[color]) return byColor[color];
    const images = Array.isArray(product.images) ? product.images : [];
    const entry = images.find((img) => typeof img === 'object' && img.color === color && (img.url || img.src));
    return entry ? entry.url || entry.src : '';
}

/**
 * Stock disponible para la combinación color+talle seleccionada — transcripción
 * literal de legacy/js/catalog.js:311-327 (`computeAvailableStock`).
 */
export function computeAvailableStock(product, selectedColor, selectedSize) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const sizes = Array.isArray(product.sizes) ? product.sizes : [];
    const productStock = Number(product.stock) || 0;

    const colorStock = selectedColor
        ? Number((variants.find((v) => v.color === selectedColor) || {}).stock)
        : NaN;
    const sizeStock = selectedSize
        ? Number((sizes.find((s) => s.size === selectedSize) || {}).stock)
        : NaN;

    if (!Number.isNaN(colorStock) && !Number.isNaN(sizeStock)) return Math.max(0, Math.min(colorStock, sizeStock));
    if (!Number.isNaN(colorStock)) return Math.max(0, colorStock);
    if (!Number.isNaN(sizeStock)) return Math.max(0, sizeStock);
    return Math.max(0, productStock);
}

/**
 * Color/talle por defecto al abrir el quick-view: primera variante/talle con
 * stock, o la primera de la lista si ninguna tiene — legacy:614-619.
 */
export function defaultVariantSelection(product) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const sizes = Array.isArray(product.sizes) ? product.sizes : [];
    const selectedColor = variants.length > 0
        ? (variants.find((v) => Number(v.stock) > 0) || variants[0]).color
        : '';
    const selectedSize = sizes.length > 0
        ? (sizes.find((s) => Number(s.stock) > 0) || sizes[0]).size
        : '';
    return { selectedColor, selectedSize };
}

// Mantener en sync con scripts/product-page-template.mjs (slugify/productPath)
// y legacy/js/catalog.js:591-598: misma fórmula de slug que usará F5.
export function slugify(name) {
    return (
        String(name || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'producto'
    );
}

/**
 * Ruta del producto individual. Legacy apuntaba a la página estática
 * `/producto/${slug}.html`; acá apunta directo al slug que F5 (`app/producto/[slug]`,
 * aún no implementado en esta fase) va a servir con la MISMA fórmula de slug
 * — 404 hasta que F5 exista, deliberado en vez de mantener el link a un
 * `.html` que Next ya no sirve.
 */
export function productPath(product) {
    return `/producto/${slugify(product.name)}-${product.id}`;
}

/**
 * URLs absolutas de todas las imágenes del producto (principal + `images[]` +
 * variantes por color), para el JSON-LD `Product.image` y `og:image` de
 * `app/producto/[slug]` — transcripción literal de `buildImageArray()` en
 * `scripts/product-page-template.mjs` (ese script no se migra, ver CLAUDE.md
 * "Qué NO migrar"; la lógica sobrevive acá).
 */
export function buildImageArray(product, siteUrl) {
    const toAbsolute = (url) => {
        const u = String(url || '').trim();
        if (!u) return '';
        if (/^https?:\/\//i.test(u)) return u;
        return siteUrl.replace(/\/$/, '') + '/' + u.replace(/^\//, '');
    };
    const out = [];
    const push = (v) => {
        const abs = toAbsolute(v);
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

/**
 * Stock total agregado del producto (para `offers.availability` del JSON-LD)
 * — distinto de `computeAvailableStock` (que resuelve una combinación
 * color+talle puntual). Transcripción de `aggregateStock()` en
 * `scripts/product-page-template.mjs`.
 */
export function totalStock(product) {
    const v = Array.isArray(product.variants) ? product.variants.reduce((n, x) => n + (Number(x.stock) || 0), 0) : 0;
    const s = Array.isArray(product.sizes) ? product.sizes.reduce((n, x) => n + (Number(x.stock) || 0), 0) : 0;
    if (v > 0) return v;
    if (s > 0) return s;
    return Number(product.stock) || 0;
}

/**
 * Matchea los query params `line`/`cat` (legacy/js/catalog.js:386-412,
 * `applyCategoryFromQuery`) contra el árbol de navegación fijo y devuelve el
 * filtro inicial a aplicar, o `null` si no hay match (mantiene el default).
 */
export function matchFilterFromQuery(lineParamRaw, catParamRaw) {
    const lineParam = String(lineParamRaw || '').toLowerCase().trim();
    const catParam = String(catParamRaw || '').toLowerCase().replace(/\+/g, ' ').trim();
    if (!lineParam && !catParam) return null;

    const items = [];
    for (const line of PRODUCTION_LINES) {
        if (!line.available) continue;
        items.push({ line: line.id, category: 'all' });
        for (const cat of ALL_CATEGORIES) items.push({ line: line.id, category: cat });
    }

    const norm = (s) => s.toLowerCase().replace(/\s+/g, '-');
    const match = items.find((it) => {
        const liLine = it.line.toLowerCase();
        const liCat = it.category.toLowerCase();
        const lineOk = !lineParam || liLine === lineParam;
        const catOk = catParam ? (liCat === catParam || norm(liCat) === norm(catParam)) : liCat === 'all';
        return lineOk && catOk;
    });

    return match ? { line: match.line, category: match.category } : null;
}
