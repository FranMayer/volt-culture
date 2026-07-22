/**
 * lib/admin/product-form.js — lógica pura del formulario de producto del
 * panel admin (components/admin/ProductFormModal.tsx). Port de las partes
 * sin DOM/Firestore de legacy/js/admin-products.js (normalizeVariants,
 * normalizeSizes, recalculateStockField, validateVariantAndSizeSections,
 * el armado de payload de saveProduct()) — plain JS (mismo patrón que
 * lib/products-data.js y lib/cart/reducer.js) para que
 * tests/admin-product-form.test.mjs la ejercite con `node` plano, sin
 * Firebase ni navegador.
 *
 * Deliberadamente NO incluye compressImage()/uploadImageToCloudinary()
 * (canvas/createImageBitmap/fetch, solo-browser) — esas viven en
 * lib/admin/upload-client.ts.
 */

/** legacy admin-products.js:139-148 */
export function normalizeVariants(raw, fallbackStock) {
    if (Array.isArray(raw) && raw.length > 0) {
        return raw.map((v) => ({
            color: String(v.color || '').trim() || 'Original',
            hex: String(v.hex || '#0b0b0b').trim() || '#0b0b0b',
            stock: Math.max(0, Number(v.stock) || 0),
        }));
    }
    return [{ color: 'Original', hex: '#0b0b0b', stock: Math.max(0, Number(fallbackStock) || 0) }];
}

/** legacy admin-products.js:150-158 */
export function normalizeSizes(raw, fallbackStock) {
    if (Array.isArray(raw) && raw.length > 0) {
        return raw.map((s) => ({
            size: String(s.size || '').trim().toUpperCase() || 'ÚNICO',
            stock: Math.max(0, Number(s.stock) || 0),
        }));
    }
    return [{ size: 'ÚNICO', stock: Math.max(0, Number(fallbackStock) || 0) }];
}

/** legacy admin-products.js:160-166 (sin generar ids acá — eso es responsabilidad del componente). */
export function normalizeImageUrls(rawImages, imageUrl, image) {
    const fromArray = Array.isArray(rawImages) ? rawImages : [];
    const normalized = fromArray.map((x) => (typeof x === 'string' ? x : '')).filter(Boolean);
    const single = imageUrl || image || '';
    if (single && !normalized.includes(single)) normalized.unshift(single);
    return normalized;
}

/** legacy admin-products.js:446-451 recalculateStockField() — total = stock por variantes, o por talles si no hay variantes con stock. */
export function computeStock(variants, sizes) {
    const variantStock = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
    const sizeStock = sizes.reduce((sum, s) => sum + (Number(s.stock) || 0), 0);
    return variantStock > 0 ? variantStock : sizeStock;
}

/** legacy admin-products.js:453-482 validateVariantAndSizeSections() — {ok:true} | {ok:false, field, message}. */
export function validateVariantsAndSizes(variants, sizes) {
    const validVariants = variants.filter((v) => String(v.color || '').trim());
    const validSizes = sizes.filter((s) => String(s.size || '').trim());

    if (validVariants.length === 0) {
        return { ok: false, field: 'variants', message: 'Agregá al menos 1 variante de color.' };
    }
    if (validSizes.length === 0) {
        return { ok: false, field: 'sizes', message: 'Agregá al menos 1 talle.' };
    }
    const seen = new Set();
    for (const size of validSizes) {
        const key = size.size.toUpperCase();
        if (seen.has(key)) {
            return { ok: false, field: 'sizes', message: `Talle duplicado: ${size.size}` };
        }
        seen.add(key);
    }
    return { ok: true };
}

/** legacy admin-products.js:529-536 — bloquea guardar mientras suben imágenes / sin ninguna imagen lista. */
export function validateImages(images) {
    if (images.some((i) => i.uploading)) {
        return { ok: false, message: 'Esperá a que terminen de subirse las imágenes.' };
    }
    const ready = images.filter((i) => !i.uploading && String(i.url || '').trim());
    if (ready.length === 0) {
        return { ok: false, message: 'Agregá al menos 1 imagen.' };
    }
    return { ok: true };
}

/**
 * Arma el payload final para lib/products.ts create()/update() a partir del
 * estado del form. Espejo de legacy saveProduct() (admin-products.js:484-522),
 * salvo `updatedAt: serverTimestamp()` — create()/update() de lib/products.ts
 * ya agregan su propio timestamp de servidor, no hace falta acá.
 */
export function buildProductPayload(form) {
    const variants = form.variants
        .map((v) => ({
            color: String(v.color || '').trim(),
            hex: String(v.hex || '#0b0b0b').trim() || '#0b0b0b',
            stock: Math.max(0, Number(v.stock) || 0),
        }))
        .filter((v) => v.color);
    const sizes = form.sizes
        .map((s) => ({
            size: String(s.size || '').trim().toUpperCase(),
            stock: Math.max(0, Number(s.stock) || 0),
        }))
        .filter((s) => s.size);
    const images = form.images
        .filter((i) => !i.uploading && String(i.url || '').trim())
        .map((i) => String(i.url).trim());

    return {
        name: form.name,
        category: form.category,
        line: (form.line || 'TC').toUpperCase(),
        description: form.description || '',
        price: parseInt(form.price, 10),
        stock: computeStock(variants, sizes),
        imageUrl: images[0] || '',
        image: images[0] || '',
        images,
        variants,
        sizes,
        active: !!form.active,
        limited: !!form.limited,
    };
}

/** legacy admin-products.js:524-527 */
export function validateRequiredFields(payload) {
    if (!payload.name || !payload.category || !payload.price || Number.isNaN(payload.price)) {
        return { ok: false, message: 'Por favor completa todos los campos requeridos' };
    }
    return { ok: true };
}

/** legacy admin-products.js:540-546 — al editar, solo se mandan los campos que cambiaron. */
export function diffChangedFields(original, next) {
    const changed = {};
    for (const key of Object.keys(next)) {
        const before = JSON.stringify((original && original[key]) ?? null);
        const after = JSON.stringify(next[key] ?? null);
        if (before !== after) changed[key] = next[key];
    }
    return changed;
}
