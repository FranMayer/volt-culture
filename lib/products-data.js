/**
 * lib/products-data.js — lógica de productos sin Firestore (SAMPLE_PRODUCTS,
 * normalización, saneo de imágenes). Port de legacy/js/products-service.js.
 *
 * .js (no .ts), mismo motivo que lib/cart/reducer.js: código puro sin deps de
 * Firestore/browser, importable por tests/products.test.mjs con `node` plano
 * (sin loader TS). lib/products.ts (glue de Firestore) importa este módulo
 * para normalizar docs reales y para el fallback cuando Firestore falla.
 */

// =====================================================
// DATOS DE EJEMPLO (fallback cuando Firestore no responde)
// =====================================================
export const SAMPLE_PRODUCTS = [
    {
        id: 'ferrari-001',
        name: 'Remera Ferrari',
        description: '100% Algodón + DTF Premium',
        price: 15200,
        stock: 0,
        category: 'Remeras',
        image: '/multi/Remera FERRARI (Delantera).jpg',
        active: true,
    },
    {
        id: 'aston-002',
        name: 'Remera Aston Martin',
        description: '100% Algodón + DTF Premium',
        price: 15200,
        stock: 0,
        category: 'Remeras',
        image: '/multi/Remera ASTON MARTIN (Delantera).png',
        active: true,
    },
    {
        id: 'alpine-003',
        name: 'Remera Alpine',
        description: '100% Algodón + DTF Premium',
        price: 15200,
        stock: 0,
        category: 'Remeras',
        image: '/multi/Remera Alpine (Delantera).jpg',
        active: true,
    },
    {
        id: 'williams-004',
        name: 'Remera Williams',
        description: '100% Algodón + DTF Premium',
        price: 15200,
        stock: 0,
        category: 'Remeras',
        image: '/multi/Remera WILLIAMS (Delantera).png',
        active: true,
    },
    {
        id: 'haas-005',
        name: 'Remera Haas',
        description: '100% Algodón + DTF Premium',
        price: 14900,
        stock: 0,
        category: 'Remeras',
        image: '/multi/Remera HAAS (Delantera).png',
        active: true,
    },
    {
        id: 'mclaren-006',
        name: 'Remera McLaren',
        description: '100% Algodón + DTF Premium',
        price: 15000,
        stock: 0,
        category: 'Remeras',
        image: '/multi/Remera MCLAREN (Delantera) (1).png',
        active: true,
    },
    {
        id: 'mercedes-007',
        name: 'Remera Mercedes Benz',
        description: '100% Algodón + DTF Premium',
        price: 14300,
        stock: 0,
        category: 'Remeras',
        image: '/multi/Remera MERCEDES (Delantera).png',
        active: true,
    },
    {
        id: 'redbull-008',
        name: 'Remera Red Bull',
        description: '100% Algodón + DTF Premium',
        price: 15900,
        stock: 0,
        category: 'Remeras',
        image: '/multi/Remera RED BULL (Delantera).png',
        active: true,
    },
    {
        id: 'alfaromeo-009',
        name: 'Remera Alfa Romeo',
        description: '100% Algodón + DTF Premium',
        price: 15200,
        stock: 0,
        category: 'Remeras',
        image: '/multi/Remera Alfa Romeo (Delantera).png',
        active: true,
    },
];

// =====================================================
// IMÁGENES DE PRODUCTO
// =====================================================

/**
 * Fallback de imagen de producto. Legacy resolvía una ruta relativa distinta
 * según si la página vivía en la raíz o en `/pages/*.html`; en Next todo
 * cuelga de `public/` en la raíz del sitio (no hay equivalente a `/pages/`),
 * así que es siempre una única ruta absoluta.
 */
export function getProductImageFallback() {
    return '/images-brand/Isotipo color.png';
}

// Cloudinary: en la entrega pedir formato y calidad automáticos (WebP/AVIF
// donde el browser lo soporte) y capar el ancho a 1000px (c_limit solo achica,
// nunca agranda) — así una foto de 2000px no viaja entera a una tarjeta chica.
// Aplica a fotos ya subidas sin re-subir nada: es una transformación al servir.
// ponytail: un solo ancho para todos los contextos; idempotente; deja pasar
// cualquier URL que no sea de Cloudinary.
function optimizeCloudinary(url) {
    if (!/res\.cloudinary\.com/.test(url) || !url.includes('/image/upload/')) return url;
    if (url.includes('f_auto')) return url;
    return url.replace('/image/upload/', '/image/upload/f_auto,q_auto,c_limit,w_1000/');
}

export function sanitizeImageUrl(url) {
    if (url == null || url === '') return getProductImageFallback();
    const str = typeof url === 'string' ? url : String(url);
    const trimmed = str.trim().replace(/^["']|["']$/g, '').trim();
    if (!trimmed) return getProductImageFallback();
    return optimizeCloudinary(trimmed);
}

function sanitizeImageMap(map) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return map;
    const out = {};
    for (const key of Object.keys(map)) {
        const val = map[key];
        out[key] = typeof val === 'string' ? sanitizeImageUrl(val) : val;
    }
    return out;
}

// =====================================================
// NORMALIZACIÓN — transcripción de `_normalizeProduct` (products-service.js:288-362)
// =====================================================
export function normalizeProduct(raw) {
    const normalized = { ...raw };

    if (!normalized.image && normalized.imageUrl) normalized.image = normalized.imageUrl;
    if (!normalized.imageUrl && normalized.image) normalized.imageUrl = normalized.image;

    if (normalized.image && typeof normalized.image === 'string') {
        normalized.image = sanitizeImageUrl(normalized.image.trim().replace(/^["']|["']$/g, '').trim());
    }
    if (normalized.imageUrl && typeof normalized.imageUrl === 'string') {
        normalized.imageUrl = sanitizeImageUrl(normalized.imageUrl.trim().replace(/^["']|["']$/g, '').trim());
    }

    if (!Array.isArray(normalized.images)) {
        normalized.images = normalized.imageUrl ? [normalized.imageUrl] : normalized.image ? [normalized.image] : [];
    } else {
        normalized.images = normalized.images
            .map((img) => {
                if (typeof img === 'string') return sanitizeImageUrl(img.trim());
                if (img && typeof img === 'object') {
                    const rawUrl = (img.url || img.src || '').trim();
                    const url = sanitizeImageUrl(rawUrl);
                    return { ...img, url, ...(img.src ? { src: url } : {}) };
                }
                return null;
            })
            .filter(Boolean);
    }

    if (normalized.variantImages) normalized.variantImages = sanitizeImageMap(normalized.variantImages);
    if (normalized.imagesByColor) normalized.imagesByColor = sanitizeImageMap(normalized.imagesByColor);

    if (!Array.isArray(normalized.variants)) {
        normalized.variants = [];
    } else {
        normalized.variants = normalized.variants.map((variant) => ({
            color: String(variant.color || '').trim(),
            hex: String(variant.hex || '#44464c').trim(),
            stock: Math.max(0, Number(variant.stock) || 0),
        }));
    }

    if (!Array.isArray(normalized.sizes)) {
        normalized.sizes = [];
    } else {
        normalized.sizes = normalized.sizes.map((size) => ({
            size: String(size.size || '').trim().toUpperCase(),
            stock: Math.max(0, Number(size.stock) || 0),
        }));
    }

    if (typeof normalized.stock !== 'number') {
        normalized.stock = Number(normalized.stock) || 0;
    }

    // Línea de producción: los productos viejos no tienen `line`.
    // Se asume Turismo Carretera (TC) por defecto, sin migrar datos.
    normalized.line = String(normalized.line || 'TC').trim().toUpperCase() || 'TC';

    return normalized;
}

/** Productos de ejemplo activos, normalizados, filtrados por categoría/línea — el fallback en sí. */
export function getFromSample(category, line) {
    let products = SAMPLE_PRODUCTS.filter((p) => p.active).map((p) => normalizeProduct(p));

    if (category && category !== 'all') {
        products = products.filter((p) => p.category === category);
    }
    if (line && line !== 'all') {
        const wanted = String(line).toUpperCase();
        products = products.filter((p) => p.line === wanted);
    }

    return products;
}
