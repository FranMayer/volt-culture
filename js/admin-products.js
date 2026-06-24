const PRESET_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'ÚNICO'];

const adminFormState = {
    editOriginal: null,
    variants: [],
    sizes: [],
    images: []
};

const moduleState = {
    deps: null,
    initialized: false
};

function getAdminToken() {
    if (typeof moduleState.deps?.getAdminToken === 'function') {
        return moduleState.deps.getAdminToken();
    }
    return window.VoltAdminAuth.getIdToken();
}

function getAdminApiUrl(path) {
    if (typeof moduleState.deps?.getAdminApiUrl === 'function') {
        return moduleState.deps.getAdminApiUrl(path);
    }
    return path;
}

function formatAdminApiError(resp, body) {
    if (typeof moduleState.deps?.formatAdminApiError === 'function') {
        return moduleState.deps.formatAdminApiError(resp, body);
    }
    return body?.error || `Error ${resp.status}`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function updateStats(products) {
    const active = products.filter((p) => p.active !== false);
    const categories = [...new Set(active.map((p) => p.category))];
    const lowStock = active.filter((p) => p.stock > 0 && p.stock <= 3);
    const outOfStock = active.filter((p) => p.stock === 0);

    document.getElementById('totalProducts').textContent = active.length;
    document.getElementById('totalCategories').textContent = categories.length;
    document.getElementById('lowStock').textContent = lowStock.length;
    document.getElementById('outOfStock').textContent = outOfStock.length;
}

function renderProductCard(product) {
    const p = product;
    return `
        <tr>
            <td>
                <img src="${escapeHtml(p.image || '')}" alt="${escapeHtml(p.name)}" class="product-thumb"
                     onerror="this.onerror=null;this.src='../images-brand/Isotipo color.png'">
            </td>
            <td><strong>${p.name}</strong><br><small class="text-muted">${p.id}</small></td>
            <td>${p.line || 'TC'} · ${p.category}</td>
            <td>$${p.price.toLocaleString('es-AR')}</td>
            <td>
                <span class="${p.stock === 0 ? 'text-danger' : p.stock <= 3 ? 'text-warning' : ''}">
                    ${p.stock}
                </span>
            </td>
            <td>
                <span class="${p.active !== false ? 'status-active' : 'status-inactive'}">
                    ${p.active !== false ? '● Activo' : '○ Inactivo'}
                </span>
            </td>
            <td>
                <button class="btn btn-sm btn-outline-secondary" onclick="toggleFeatured('${p.id}', ${p.featured === true})" title="${p.featured === true ? 'Quitar de destacados' : 'Destacar'}" aria-label="${p.featured === true ? 'Quitar de destacados' : 'Destacar'}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="${p.featured === true ? '#FFD700' : 'none'}" stroke="${p.featured === true ? '#FFD700' : 'currentColor'}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-0.15em"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </button>
                <button class="btn btn-sm btn-outline-volt" onclick="editProduct('${p.id}')" title="Editar" aria-label="Editar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-0.15em"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteProduct('${p.id}')" title="Eliminar" aria-label="Eliminar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-0.15em"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                </button>
            </td>
        </tr>
    `;
}

function renderProducts(products) {
    const tbody = document.getElementById('productsTable');
    if (products.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-4">
                    No hay productos. <a href="#" class="text-danger" data-bs-toggle="modal" data-bs-target="#productModal">Agregar uno</a>
                </td>
            </tr>
        `;
        return;
    }
    tbody.innerHTML = products.map((p) => renderProductCard(p)).join('');
}

async function loadProducts() {
    try {
        const products = await window.ProductsService.getAllAdmin();
        renderProducts(products);
        updateStats(products);
    } catch (error) {
        console.error('Error al cargar productos:', error);
    }
}

function normalizeVariants(raw, fallbackStock) {
    if (Array.isArray(raw) && raw.length > 0) {
        return raw.map((v) => ({
            color: String(v.color || '').trim() || 'Original',
            hex: String(v.hex || '#0b0b0b').trim() || '#0b0b0b',
            stock: Math.max(0, Number(v.stock) || 0)
        }));
    }
    return [{ color: 'Original', hex: '#0b0b0b', stock: Math.max(0, Number(fallbackStock) || 0) }];
}

function normalizeSizes(raw, fallbackStock) {
    if (Array.isArray(raw) && raw.length > 0) {
        return raw.map((s) => ({
            size: String(s.size || '').trim().toUpperCase() || 'ÚNICO',
            stock: Math.max(0, Number(s.stock) || 0)
        }));
    }
    return [{ size: 'ÚNICO', stock: Math.max(0, Number(fallbackStock) || 0) }];
}

function normalizeImages(rawImages, imageUrl, image) {
    const fromArray = Array.isArray(rawImages) ? rawImages : [];
    const normalized = fromArray.map((x) => (typeof x === 'string' ? x : '')).filter(Boolean);
    const single = imageUrl || image || '';
    if (single && !normalized.includes(single)) normalized.unshift(single);
    return normalized.map((url) => ({ id: crypto.randomUUID(), url, uploading: false }));
}

function addVariantRow(color = '', hex = '#0b0b0b', stock = 0) {
    adminFormState.variants.push({ id: crypto.randomUUID(), color, hex, stock: Math.max(0, Number(stock) || 0) });
    renderVariants();
    recalculateStockField();
}

function addSizeRow(size = '', stock = 0) {
    const normalizedSize = String(size || '').trim().toUpperCase();
    if (normalizedSize && adminFormState.sizes.some((s) => s.size === normalizedSize)) return;
    adminFormState.sizes.push({ id: crypto.randomUUID(), size: normalizedSize, stock: Math.max(0, Number(stock) || 0) });
    renderSizes();
    recalculateStockField();
}

function moveItem(listKey, index, direction) {
    const list = adminFormState[listKey];
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    if (listKey === 'variants') renderVariants();
    if (listKey === 'sizes') renderSizes();
    if (listKey === 'images') renderImages();
}

function renderVariants() {
    const container = document.getElementById('variantsList');
    container.innerHTML = adminFormState.variants.map((variant, index) => `
        <div class="list-editor-row" data-id="${variant.id}">
            <input class="form-control variant-color" placeholder="Color" value="${escapeHtml(variant.color)}">
            <input type="color" class="form-control form-control-color variant-hex" value="${escapeHtml(variant.hex || '#0b0b0b')}">
            <input type="number" class="form-control variant-stock" min="0" value="${variant.stock}">
            <div class="d-flex align-items-center gap-1">
                <div class="swatch-preview" style="background:${escapeHtml(variant.hex || '#44464c')}"></div>
                <button type="button" class="icon-btn variant-up" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" class="icon-btn variant-down" ${index === adminFormState.variants.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" class="icon-btn variant-remove">×</button>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.list-editor-row').forEach((row, index) => {
        row.querySelector('.variant-color').addEventListener('input', (e) => {
            adminFormState.variants[index].color = e.target.value;
        });
        row.querySelector('.variant-hex').addEventListener('input', (e) => {
            adminFormState.variants[index].hex = e.target.value || '#0b0b0b';
            row.querySelector('.swatch-preview').style.background = adminFormState.variants[index].hex;
        });
        row.querySelector('.variant-stock').addEventListener('input', (e) => {
            adminFormState.variants[index].stock = Math.max(0, Number(e.target.value) || 0);
            recalculateStockField();
        });
        row.querySelector('.variant-remove').addEventListener('click', () => {
            adminFormState.variants.splice(index, 1);
            renderVariants();
            recalculateStockField();
        });
        row.querySelector('.variant-up').addEventListener('click', () => moveItem('variants', index, -1));
        row.querySelector('.variant-down').addEventListener('click', () => moveItem('variants', index, 1));
    });
}

function renderSizes() {
    const container = document.getElementById('sizesList');
    container.innerHTML = adminFormState.sizes.map((item, index) => `
        <div class="list-editor-row list-editor-row--sizes" data-id="${item.id}">
            <input class="form-control size-name" placeholder="Talle" value="${escapeHtml(item.size)}">
            <input type="number" class="form-control size-stock" min="0" value="${item.stock}">
            <div class="d-flex align-items-center gap-1">
                <button type="button" class="icon-btn size-up" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" class="icon-btn size-down" ${index === adminFormState.sizes.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" class="icon-btn size-remove">×</button>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.list-editor-row').forEach((row, index) => {
        row.querySelector('.size-name').addEventListener('input', (e) => {
            const next = String(e.target.value || '').trim().toUpperCase();
            if (!next) {
                adminFormState.sizes[index].size = '';
                return;
            }
            const duplicate = adminFormState.sizes.some((s, i) => i !== index && s.size === next);
            if (duplicate) return;
            adminFormState.sizes[index].size = next;
            e.target.value = next;
        });
        row.querySelector('.size-stock').addEventListener('input', (e) => {
            adminFormState.sizes[index].stock = Math.max(0, Number(e.target.value) || 0);
            recalculateStockField();
        });
        row.querySelector('.size-remove').addEventListener('click', () => {
            adminFormState.sizes.splice(index, 1);
            renderSizes();
            recalculateStockField();
        });
        row.querySelector('.size-up').addEventListener('click', () => moveItem('sizes', index, -1));
        row.querySelector('.size-down').addEventListener('click', () => moveItem('sizes', index, 1));
    });
}

// Redimensiona/recomprime la imagen en el navegador para no chocar con el
// límite de Cloudinary (10 MB por archivo en el plan gratuito) y aligerar la
// tienda. Devuelve un File JPG; si algo falla, cae al archivo original.
async function compressImage(file, { maxDimension = 2000, quality = 0.85 } = {}) {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;

    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
        const width = Math.round(bitmap.width * scale);
        const height = Math.round(bitmap.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
        bitmap.close?.();

        const blob = await new Promise((resolve) =>
            canvas.toBlob(resolve, 'image/jpeg', quality)
        );
        if (!blob) return file;

        // Si por lo que sea quedó más pesado que el original, usamos el original.
        if (blob.size >= file.size) return file;

        const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
        return new File([blob], name, { type: 'image/jpeg' });
    } catch (err) {
        console.warn('No se pudo comprimir la imagen, se sube el original:', err);
        return file;
    }
}

async function uploadImageToCloudinary(file) {
    const token = await getAdminToken();
    const signResp = await fetch(getAdminApiUrl('/api/admin-upload'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!signResp.ok) {
        const err = await signResp.json().catch(() => ({}));
        throw new Error(formatAdminApiError(signResp, err));
    }
    const { signature, timestamp, cloudName, apiKey, params: signedParams } = await signResp.json();

    const formData = new FormData();
    const orderedKeys = Object.keys(signedParams || { timestamp }).sort();
    for (const key of orderedKeys) {
        formData.append(key, String(signedParams[key]));
    }
    formData.append('api_key', apiKey);
    formData.append('signature', signature);
    formData.append('file', file);

    const uploadResp = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: 'POST', body: formData }
    );
    const data = await uploadResp.json();
    if (data.secure_url) return data.secure_url;
    throw new Error(data.error?.message || 'Upload failed');
}

function handleImageFiles(files) {
    Array.from(files).forEach((file) => {
        if (!file.type.startsWith('image/')) return;

        const id = Date.now() + Math.random();
        const previewUrl = URL.createObjectURL(file);

        adminFormState.images.push({ id, url: previewUrl, uploading: true });
        renderImages();

        compressImage(file)
            .then((optimized) => uploadImageToCloudinary(optimized))
            .then((secureUrl) => {
                const item = adminFormState.images.find((i) => i.id === id);
                if (item) {
                    URL.revokeObjectURL(previewUrl);
                    item.url = secureUrl;
                    item.uploading = false;
                }
            })
            .catch((err) => {
                console.error('Cloudinary upload error:', err);
                adminFormState.images = adminFormState.images.filter((i) => i.id !== id);
                alert('❌ Error al subir imagen: ' + (err?.message || 'desconocido'));
            })
            .finally(() => renderImages());
    });
}

function handleImagesInput(e) {
    handleImageFiles(e.target.files || []);
    e.target.value = '';
}

function initImagesDropzone() {
    const dropzone = document.getElementById('imagesDropzone');
    if (!dropzone) return;

    dropzone.addEventListener('click', (e) => {
        if (e.target.closest('#imagesInput')) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.onchange = (ev) => handleImageFiles(ev.target.files);
        input.click();
    });

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('is-dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('is-dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('is-dragover');
        handleImageFiles(e.dataTransfer.files);
    });
}

function addDirectImageUrl() {
    const input = document.getElementById('imageUrlInput');
    const url = String(input.value || '').trim();
    if (!url) return;
    adminFormState.images.push({ id: crypto.randomUUID(), url, uploading: false });
    input.value = '';
    renderImages();
}

function renderImages() {
    const container = document.getElementById('imagesList');
    container.innerHTML = adminFormState.images.map((item, index) => `
        <div class="image-card" draggable="true" data-id="${item.id}">
            ${index === 0 ? '<span class="image-card__badge">Principal</span>' : ''}
            <img src="${escapeHtml(item.url)}" alt="img ${index + 1}" onerror="this.src='../images-brand/Isotipo color.png'">
            <button type="button" class="image-card__remove">×</button>
            ${item.uploading ? '<div class="image-card__loading"><span class="spinner-border spinner-border-sm me-2"></span>subiendo...</div>' : ''}
        </div>
    `).join('');

    let dragId = null;
    container.querySelectorAll('.image-card').forEach((card) => {
        const id = card.getAttribute('data-id');
        card.addEventListener('dragstart', () => {
            dragId = id;
            card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => {
            dragId = null;
            card.classList.remove('dragging');
        });
        card.addEventListener('dragover', (e) => e.preventDefault());
        card.addEventListener('drop', () => {
            if (!dragId || dragId === id) return;
            const from = adminFormState.images.findIndex((i) => i.id === dragId);
            const to = adminFormState.images.findIndex((i) => i.id === id);
            if (from < 0 || to < 0) return;
            const [moved] = adminFormState.images.splice(from, 1);
            adminFormState.images.splice(to, 0, moved);
            renderImages();
        });
        card.querySelector('.image-card__remove').addEventListener('click', () => {
            adminFormState.images = adminFormState.images.filter((i) => i.id !== id);
            renderImages();
        });
    });
}

function recalculateStockField() {
    const variantStock = adminFormState.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
    const sizeStock = adminFormState.sizes.reduce((sum, s) => sum + (Number(s.stock) || 0), 0);
    const total = variantStock > 0 ? variantStock : sizeStock;
    document.getElementById('productStock').value = String(total || 0);
}

function validateVariantAndSizeSections() {
    const validVariants = adminFormState.variants.filter((v) => String(v.color || '').trim());
    const validSizes = adminFormState.sizes.filter((s) => String(s.size || '').trim());
    const variantsError = document.getElementById('variantsError');
    const sizesError = document.getElementById('sizesError');
    variantsError.style.display = 'none';
    sizesError.style.display = 'none';

    if (validVariants.length === 0) {
        variantsError.textContent = 'Agregá al menos 1 variante de color.';
        variantsError.style.display = 'block';
        return false;
    }
    if (validSizes.length === 0) {
        sizesError.textContent = 'Agregá al menos 1 talle.';
        sizesError.style.display = 'block';
        return false;
    }
    const seen = new Set();
    for (const size of validSizes) {
        const key = size.size.toUpperCase();
        if (seen.has(key)) {
            sizesError.textContent = `Talle duplicado: ${size.size}`;
            sizesError.style.display = 'block';
            return false;
        }
        seen.add(key);
    }
    return true;
}

async function saveProduct() {
    const id = document.getElementById('productId').value;
    const variants = adminFormState.variants
        .map((v) => ({
            color: String(v.color || '').trim(),
            hex: String(v.hex || '#0b0b0b').trim() || '#0b0b0b',
            stock: Math.max(0, Number(v.stock) || 0)
        }))
        .filter((v) => v.color);
    const sizes = adminFormState.sizes
        .map((s) => ({
            size: String(s.size || '').trim().toUpperCase(),
            stock: Math.max(0, Number(s.stock) || 0)
        }))
        .filter((s) => s.size);
    const images = adminFormState.images
        .filter((i) => !i.uploading && String(i.url || '').trim())
        .map((i) => String(i.url).trim());

    const totalStockByVariants = variants.reduce((sum, v) => sum + v.stock, 0);
    const totalStockBySizes = sizes.reduce((sum, s) => sum + s.stock, 0);
    const computedStock = totalStockByVariants > 0 ? totalStockByVariants : totalStockBySizes;

    const productData = {
        name: document.getElementById('productName').value,
        category: document.getElementById('productCategory').value,
        line: (document.getElementById('productLine').value || 'TC').toUpperCase(),
        description: document.getElementById('productDescription').value,
        price: parseInt(document.getElementById('productPrice').value, 10),
        stock: computedStock,
        imageUrl: images[0] || '',
        image: images[0] || '',
        images,
        variants,
        sizes,
        active: document.getElementById('productActive').value === 'true',
        limited: document.getElementById('productLimited').checked,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!productData.name || !productData.category || !productData.price) {
        alert('Por favor completa todos los campos requeridos');
        return;
    }
    if (!validateVariantAndSizeSections()) return;
    if (adminFormState.images.some((i) => i.uploading)) {
        alert('Esperá a que terminen de subirse las imágenes.');
        return;
    }
    if (images.length === 0) {
        alert('Agregá al menos 1 imagen.');
        return;
    }

    try {
        if (id) {
            const changed = {};
            const original = adminFormState.editOriginal || {};
            Object.keys(productData).forEach((key) => {
                const before = JSON.stringify(original[key] ?? null);
                const after = JSON.stringify(productData[key] ?? null);
                if (before !== after) changed[key] = productData[key];
            });
            if (Object.keys(changed).length > 0) {
                await window.ProductsService.update(id, changed);
            }
            alert('✅ Producto actualizado');
        } else {
            await window.ProductsService.create(productData);
            alert('✅ Producto creado');
        }

        bootstrap.Modal.getInstance(document.getElementById('productModal')).hide();
        resetForm();
        await loadProducts();
    } catch (error) {
        console.error('Error al guardar:', error);
        alert(`❌ Error: ${error.message}`);
    }
}

async function editProduct(id) {
    try {
        const product = await window.ProductsService.getById(id);
        if (product) {
            document.getElementById('modalTitle').textContent = 'EDITAR PRODUCTO';
            document.getElementById('productId').value = id;
            document.getElementById('productName').value = product.name;
            document.getElementById('productCategory').value = product.category;
            document.getElementById('productLine').value = (product.line || 'TC').toUpperCase();
            document.getElementById('productDescription').value = product.description || '';
            document.getElementById('productPrice').value = product.price;
            document.getElementById('productStock').value = product.stock || 0;
            document.getElementById('productActive').value = product.active !== false ? 'true' : 'false';
            document.getElementById('productLimited').checked = product.limited === true;
            adminFormState.editOriginal = {
                name: product.name || '',
                category: product.category || '',
                line: (product.line || 'TC').toUpperCase(),
                description: product.description || '',
                price: Number(product.price) || 0,
                stock: Number(product.stock) || 0,
                imageUrl: product.imageUrl || product.image || '',
                image: product.image || product.imageUrl || '',
                images: (product.images || []).map((i) => (typeof i === 'string' ? i : '')),
                variants: normalizeVariants(product.variants, product.stock),
                sizes: normalizeSizes(product.sizes, product.stock),
                active: product.active !== false,
                limited: product.limited === true
            };
            adminFormState.variants = normalizeVariants(product.variants, product.stock).map((v) => ({ id: crypto.randomUUID(), ...v }));
            adminFormState.sizes = normalizeSizes(product.sizes, product.stock).map((s) => ({ id: crypto.randomUUID(), ...s }));
            adminFormState.images = normalizeImages(product.images, product.imageUrl, product.image);
            renderVariants();
            renderSizes();
            renderImages();
            recalculateStockField();

            new bootstrap.Modal(document.getElementById('productModal')).show();
        }
    } catch (error) {
        console.error('Error al cargar producto:', error);
        alert('❌ Error al cargar el producto');
    }
}

async function deleteProduct(id) {
    if (!confirm('¿Estás seguro de eliminar este producto?')) return;

    try {
        await window.ProductsService.delete(id);
        alert('✅ Producto eliminado');
        await loadProducts();
    } catch (error) {
        console.error('Error al eliminar:', error);
        alert(`❌ Error: ${error.message}`);
    }
}

async function toggleFeatured(id, isFeatured) {
    try {
        await window.ProductsService.update(id, { featured: !isFeatured });
        await loadProducts();
    } catch (error) {
        console.error('Error al cambiar destacado:', error);
        alert(`❌ No se pudo actualizar el destacado: ${error.message}`);
    }
}

async function importSampleProducts() {
    if (!window.FirebaseConfig.isInitialized()) {
        alert('⚠️ Primero debes configurar Firebase');
        new bootstrap.Modal(document.getElementById('configModal')).show();
        return;
    }

    if (!confirm('¿Importar los productos de ejemplo a Firebase?')) return;

    try {
        await window.ProductsService.importSampleProducts();
        alert('✅ Productos importados correctamente');
        await loadProducts();
    } catch (error) {
        console.error('Error al importar:', error);
        alert(`❌ Error: ${error.message}`);
    }
}

function resetForm() {
    document.getElementById('modalTitle').textContent = 'NUEVO PRODUCTO';
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    adminFormState.editOriginal = null;
    adminFormState.variants = [{ id: crypto.randomUUID(), color: 'Original', hex: '#0b0b0b', stock: 0 }];
    adminFormState.sizes = [{ id: crypto.randomUUID(), size: 'ÚNICO', stock: 0 }];
    adminFormState.images = [];
    renderVariants();
    renderSizes();
    renderImages();
    recalculateStockField();
    document.getElementById('variantsError').style.display = 'none';
    document.getElementById('sizesError').style.display = 'none';
}

function initProductFormEnhancements() {
    const quickSizes = document.getElementById('quickSizes');
    quickSizes.innerHTML = PRESET_SIZES.map((size) => (
        `<button type="button" class="chip-btn" data-size="${size}">${size}</button>`
    )).join('');

    quickSizes.querySelectorAll('.chip-btn').forEach((btn) => {
        btn.addEventListener('click', function onClick() {
            addSizeRow(this.getAttribute('data-size') || 'ÚNICO', 0);
        });
    });

    document.getElementById('addVariantBtn').addEventListener('click', () => addVariantRow());
    document.getElementById('addSizeBtn').addEventListener('click', () => addSizeRow());
    document.getElementById('imagesInput').addEventListener('change', handleImagesInput);
    document.getElementById('addImageUrlBtn').addEventListener('click', addDirectImageUrl);
    document.getElementById('saveProduct').addEventListener('click', saveProduct);
    document.getElementById('importBtn').addEventListener('click', importSampleProducts);
    document.getElementById('productModal').addEventListener('show.bs.modal', () => {
        if (!document.getElementById('productId').value) {
            resetForm();
        }
    });

    initImagesDropzone();
    renderVariants();
    renderSizes();
    renderImages();
    recalculateStockField();
}

function init(deps = {}) {
    moduleState.deps = deps;
    if (moduleState.initialized) return;
    moduleState.initialized = true;
    initProductFormEnhancements();

    // Mantener compatibilidad con handlers inline existentes.
    window.editProduct = editProduct;
    window.deleteProduct = deleteProduct;
    window.toggleFeatured = toggleFeatured;
}

window.AdminProducts = {
    init,
    loadProducts,
    renderProducts,
    renderProductCard,
    saveProduct,
    deleteProduct,
    uploadImageToCloudinary
};

export {
    init,
    loadProducts,
    renderProducts,
    renderProductCard,
    saveProduct,
    deleteProduct,
    uploadImageToCloudinary,
    importSampleProducts
};
