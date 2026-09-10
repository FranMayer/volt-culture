/**
 * lib/catalog-helpers.js — lógica pura del catálogo (sin DOM/React), port de
 * legacy/js/catalog.js. Plain JS (no .ts), mismo patrón que lib/products-data.js
 * y lib/cart/reducer.js: sin dependencias de browser/Firestore, importable por
 * tests/catalog-helpers.test.mjs con `node` plano. components/catalog/* la
 * consume para render + selección de variantes.
 */

// =====================================================
// ESTÉTICAS (`line`) Y TIPOS DE PRENDA (`category`)
// VOLT no es una marca de TC: el TC es donde arrancó, pero el universo es todo
// lo que tenga cuatro ruedas. Por eso `line` NO es una navegación separada por
// universo sino un FILTRO de estética/sub-cultura, ortogonal al tipo de prenda.
// `id` es el valor guardado en products/{id}.line (mayúsculas, normalizeProduct).
// Agregar una estética nueva = una línea acá (el select del admin y el sidebar
// se alimentan de esta lista).
// =====================================================
export const PRODUCTION_LINES = [
    { id: 'TC', label: 'TC', blurb: 'Cultura argentina, circuitos nacionales' },
    { id: 'F1', label: 'F1', blurb: 'Historia, pilotos, circuitos míticos' },
    { id: 'JDM', label: 'JDM', blurb: 'Cultura japonesa, drift, street' },
    { id: 'GT', label: 'GT / Sports', blurb: 'Porsche, blueprints, el lado premium' },
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
 * Stock agregado "clásico" (variantes > talles > stock plano) — YA NO decide
 * disponibilidad por sí solo. Sobrevive únicamente como fallback de migración
 * dentro de `isAvailable()` para productos viejos que todavía no tienen el
 * campo `available` (productos que no fueron re-guardados desde que VOLT
 * pasó de stock numérico a disponible/no disponible).
 */
function aggregateStock(product) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const sizes = Array.isArray(product.sizes) ? product.sizes : [];
    const variantStock = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
    const sizeStock = sizes.reduce((sum, s) => sum + (Number(s.stock) || 0), 0);
    if (variantStock > 0) return variantStock;
    if (sizeStock > 0) return sizeStock;
    return Number(product.stock) || 0;
}

/** Disponibilidad de un talle puntual — `available` explícito o, si no está seteado, fallback a `stock > 0` (docs viejos). */
export function isSizeAvailable(size) {
    if (!size) return true;
    if (typeof size.available === 'boolean') return size.available;
    return Number(size.stock) > 0;
}

/**
 * Disponibilidad real de compra: producto + (opcional) talle puntual.
 * Reemplaza a `computeAvailableStock` — ya no hay cantidades, solo sí/no.
 */
export function isAvailable(product, variantSize) {
    if (!product) return false;
    const productAvailable = typeof product.available === 'boolean'
        ? product.available
        : aggregateStock(product) > 0;
    if (!productAvailable) return false;

    if (variantSize) {
        const sizes = Array.isArray(product.sizes) ? product.sizes : [];
        // Comparación case-insensitive: los endpoints pasan el doc crudo de
        // Firestore (docs viejos pueden tener `size: 'm'`), mientras que el
        // cliente compara contra talles ya normalizados a mayúsculas por
        // normalizeProduct(). Sin esto un doc viejo con talle en minúscula
        // nunca matchea y el servidor deja pasar un talle no disponible.
        const wanted = String(variantSize).trim().toUpperCase();
        const size = sizes.find((s) => String(s.size || '').trim().toUpperCase() === wanted);
        if (size) return isSizeAvailable(size);
    }
    return true;
}

/** Tope de cantidad por línea de carrito — cliente y servidor comparten el mismo número. */
export const MAX_QTY_PER_LINE = 10;

/**
 * Color/talle por defecto al abrir el quick-view: primer color de la lista
 * (los colores no tienen disponibilidad propia, heredan la del producto) +
 * primer talle disponible, o el primero de la lista si ninguno lo está.
 */
export function defaultVariantSelection(product) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const sizes = Array.isArray(product.sizes) ? product.sizes : [];
    const selectedColor = variants.length > 0 ? variants[0].color : '';
    const selectedSize = sizes.length > 0
        ? (sizes.find((s) => isSizeAvailable(s)) || sizes[0]).size
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

/** Normaliza un valor de filtro para comparar/serializar: 'GT / Sports' -> 'gt-sports'. */
const norm = (s) => String(s || '').toLowerCase().replace(/\+/g, ' ').replace(/[\s/]+/g, '-').trim();

/**
 * Resuelve los query params `line`/`cat` (deep-links tipo `/catalogo?line=jdm`)
 * a un filtro inicial. Cada eje se resuelve por separado — un `?cat=gorras` sin
 * `line` ya no queda pegado a la primera línea del árbol: muestra gorras de
 * todas las estéticas. Params desconocidos degradan a 'all' en vez de tirar
 * todo el filtro.
 */
export function matchFilterFromQuery(lineParamRaw, catParamRaw) {
    const lineParam = norm(lineParamRaw);
    const catParam = norm(catParamRaw);
    if (!lineParam && !catParam) return null;

    const line = PRODUCTION_LINES.find((l) => norm(l.id) === lineParam);
    const category = ALL_CATEGORIES.find((c) => norm(c) === catParam);
    return { line: line ? line.id : 'all', category: category || 'all' };
}

/**
 * URL compartible de un estado de filtro — inversa de `matchFilterFromQuery`.
 * Cada categoría del sidebar es un link real a esta URL (`/catalogo?line=f1`,
 * mismo formato que los links de novedades), así se puede copiar, compartir
 * y volver con el botón atrás.
 */
export function catalogHref(filterState) {
    const { line, category } = filterState || {};
    const qs = new URLSearchParams();
    if (line && line !== 'all') qs.set('line', norm(line));
    if (category && category !== 'all') qs.set('cat', norm(category));
    const query = qs.toString();
    return query ? `/catalogo?${query}` : '/catalogo';
}
