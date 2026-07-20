/**
 * VOLT - Catalog Manager
 * Maneja la carga dinámica de productos y el filtrado por categorías
 */

document.addEventListener('DOMContentLoaded', async function() {

    function productImgOnerror() {
        return window.ProductsService?.getProductImageOnerrorAttr?.()
            || 'onerror="this.src=\'../images-brand/Isotipo color.png\'; this.onerror=null;"';
    }

    function productImgFallback() {
        return window.ProductsService?.getProductImageFallback?.()
            || '../images-brand/Isotipo color.png';
    }
    
    // =====================================================
    // INICIALIZACIÓN
    // =====================================================
    
    // Inicializar Firebase si está configurado
    if (window.FirebaseConfig) {
        window.FirebaseConfig.init();
    }

    const productGrid = document.querySelector('.product-grid');
    const noProductsMessage = document.querySelector('.no-products-message');
    const loader = document.querySelector('.loader-overlay');

    if (!productGrid) return;

    // =====================================================
    // CARGAR PRODUCTOS
    // =====================================================
    
    async function loadProducts() {
        try {
            // Mostrar loader
            if (loader) loader.style.display = 'flex';

            const category = filterState.category === 'all' ? null : filterState.category;
            const line = filterState.line === 'all' ? null : filterState.line;
            const products = await window.ProductsService.getAll(category, line);

            // Limpiar grid (excepto el mensaje de no productos)
            const existingCards = productGrid.querySelectorAll('.product-card');
            existingCards.forEach(card => card.remove());

            // Verificar si hay productos
            if (products.length === 0) {
                if (noProductsMessage) {
                    noProductsMessage.style.display = 'block';
                }
            } else {
                if (noProductsMessage) {
                    noProductsMessage.style.display = 'none';
                }

                // Renderizar productos
                products.forEach((product, index) => {
                    const card = createProductCard(product, index);
                    productGrid.appendChild(card);
                });

                if (!deepLinkHandled) {
                    deepLinkHandled = true;
                    const wantedId = new URLSearchParams(location.search).get('product');
                    if (wantedId) {
                        let target = products.find((x) => String(x.id) === wantedId);
                        if (!target) {
                            // El filtro inicial (ej. línea F1) puede no incluir el producto
                            // buscado: las páginas /producto/ enlazan con ?product= a
                            // cualquier línea. El modal no depende de la grilla, así que
                            // buscamos en el catálogo completo.
                            const all = await window.ProductsService.getAll(null, null);
                            target = all.find((x) => String(x.id) === wantedId);
                        }
                        if (target) openQuickView(target);
                    }
                }
            }

        } catch (error) {
            console.error('Error al cargar productos:', error);
            if (noProductsMessage) {
                noProductsMessage.innerHTML = '<p>No pudimos cargar los productos. Intentá de nuevo en unos minutos.</p>';
                noProductsMessage.style.display = 'block';
            }
        } finally {
            // Ocultar loader
            if (loader) {
                loader.style.opacity = '0';
                setTimeout(() => {
                    loader.style.display = 'none';
                }, 300);
            }
        }
    }

    // =====================================================
    // CREAR TARJETA DE PRODUCTO
    // =====================================================

    function isHoodieProduct(product) {
        const cat = String(product.category || '').toLowerCase();
        const name = String(product.name || '').toLowerCase();
        return cat === 'buzos' || name.includes('hoodie') || name.includes('buzo');
    }

    // El sello "Edición limitada" solo se muestra en los drops marcados
    // explícitamente (product.limited === true). Si todo lo lleva, pierde fuerza.
    function renderLimitedBadge(product) {
        if (product.limited !== true) return '';
        return '<span class="product-badge-limited" aria-hidden="true">Edición limitada</span>';
    }

    // Etiqueta de tipo para todas las categorías (no solo hoodies), para que la
    // fila de precio tenga el mismo ritmo en toda la grilla.
    function getProductTypeLabel(product) {
        if (isHoodieProduct(product)) return 'HOODIE';
        const cat = String(product.category || '').toLowerCase();
        if (cat.includes('remera')) return 'REMERA';
        if (cat.includes('gorra')) return 'GORRA';
        if (cat.includes('auto') || cat.includes('escala')) return 'ESCALA';
        return cat ? cat.replace(/s$/, '').toUpperCase() : '';
    }

    function renderProductTypeTag(product) {
        const label = getProductTypeLabel(product);
        if (!label) return '';
        // Hoodie mantiene el chip relleno; el resto usa la variante delineada.
        const variantClass = isHoodieProduct(product) ? '' : ' product-type-tag--alt';
        return `<span class="product-type-tag${variantClass}">${label}</span>`;
    }
    
    function createProductCard(product, index) {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.setAttribute('data-category', product.category);
        card.setAttribute('data-id', product.id);
        card.setAttribute('data-price', product.price);
        
        // Animación de entrada escalonada
        card.style.animation = `fadeInUp 0.4s ease forwards ${index * 0.05}s`;
        card.style.opacity = '0';

        // Formatear precio
        const formattedPrice = product.price.toLocaleString('es-AR');

        // La card es solo el "trigger": imagen + datos + botón que abre el modal.
        // La selección (color/talle/cantidad) y la compra viven en el quick-view.
        const gallery = getProductGallery(product);
        const initialImageRaw = gallery[0] || product.image || productImgFallback();
        const initialImage = escapeHtml(initialImageRaw);

        card.innerHTML = `
            <div class="product-image-wrap">
                ${renderLimitedBadge(product)}
                <span class="product-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
                <img src="${initialImage}" alt="${escapeHtml(product.name)}" class="product-image" loading="lazy" role="button" tabindex="0" aria-label="Ampliar imagen de ${escapeHtml(product.name)}" ${productImgOnerror()}>
            </div>
            <div class="product-compact">
                <h3 class="product-title">${escapeHtml(product.name)}</h3>
                <p class="product-description">${product.description ? escapeHtml(product.description) : ''}</p>
                <div class="product-price-row">
                    <p class="product-price">$${formattedPrice}</p>
                    ${renderProductTypeTag(product)}
                </div>
                <button type="button" class="product-expand-toggle" aria-haspopup="dialog" aria-label="Ver producto ${escapeHtml(product.name)}">
                    <span class="product-expand-label">Ver producto →</span>
                </button>
            </div>
        `;

        initCardInteractions(card, product);
        return card;
    }

    function renderColorSelector(variants, selectedColor) {
        if (!variants.length) return '';
        return `
            <div class="variant-group variant-group--colors">
                <span class="variant-label">Color</span>
                <div class="color-swatches">
                    ${variants.map(variant => {
                        const isActive = variant.color === selectedColor;
                        const stock = Number(variant.stock) || 0;
                        return `
                            <button type="button"
                                class="color-swatch ${isActive ? 'is-active' : ''}"
                                data-color="${escapeHtml(variant.color || '')}"
                                data-hex="${escapeHtml(variant.hex || '#44464c')}"
                                title="${escapeHtml(variant.color || '')}"
                                aria-label="Color ${escapeHtml(variant.color || '')}"
                                style="--swatch-color: ${escapeHtml(variant.hex || '#44464c')}"
                                ${stock === 0 ? 'data-no-stock="true"' : ''}>
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    function renderSizeSelector(sizes, selectedSize) {
        if (!sizes.length) return '';
        return `
            <div class="variant-group variant-group--sizes">
                <span class="variant-label">Talle</span>
                <div class="size-buttons">
                    ${sizes.map(item => {
                        const stock = Number(item.stock) || 0;
                        const active = item.size === selectedSize;
                        return `
                            <button type="button"
                                class="size-btn ${active ? 'is-active' : ''} ${stock === 0 ? 'is-disabled' : ''}"
                                data-size="${escapeHtml(item.size || '')}"
                                ${stock === 0 ? 'disabled' : ''}>
                                ${escapeHtml(item.size || '')}
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    function renderQuantitySelector(maxStock) {
        const max = Math.max(1, Number(maxStock) || 1);
        return `
            <div class="variant-group variant-group--qty">
                <span class="variant-label">Cantidad</span>
                <div class="qty-control">
                    <button type="button" class="qty-btn qty-minus" aria-label="Disminuir cantidad">−</button>
                    <input type="number" class="qty-input" min="1" max="${max}" value="1" inputmode="numeric" />
                    <button type="button" class="qty-btn qty-plus" aria-label="Aumentar cantidad">+</button>
                </div>
            </div>
        `;
    }

    function initCardInteractions(card, product) {
        const imageEl = card.querySelector('.product-image');
        const expandToggle = card.querySelector('.product-expand-toggle');

        if (expandToggle) {
            expandToggle.addEventListener('click', function(event) {
                event.stopPropagation();
                openQuickView(product);
            });
        }

        // Tap en la card (fuera de imagen/botones/inputs) también abre el modal.
        card.addEventListener('click', function(event) {
            if (
                event.target.closest('.product-image') ||
                event.target.closest('button') ||
                event.target.closest('input')
            ) {
                return;
            }
            openQuickView(product);
        });

        // La imagen de la card abre el zoom (lightbox) directamente.
        if (imageEl) {
            imageEl.addEventListener('click', function() {
                openLightbox(product, this.getAttribute('src') || '');
            });
            imageEl.addEventListener('keydown', function(evt) {
                if (evt.key === 'Enter') openLightbox(product, this.getAttribute('src') || '');
            });
        }
    }

    function updateStockUI(card, stock) {
        const stockEl = card.querySelector('.product-stock');
        if (!stockEl) return;
        if (stock <= 0) {
            stockEl.classList.add('product-stock--out');
            stockEl.innerHTML = `Sin stock <span>0</span>`;
        } else {
            stockEl.classList.remove('product-stock--out');
            stockEl.innerHTML = `Disponibles: <span>${stock}</span>`;
        }
    }

    function getProductGallery(product) {
        const images = Array.isArray(product.images) ? product.images : [];
        const urls = images.map(img => {
            if (typeof img === 'string') return img;
            if (img && typeof img === 'object') return img.url || img.src || '';
            return '';
        }).filter(Boolean);
        if (product.image && !urls.includes(product.image)) {
            urls.unshift(product.image);
        }
        return urls;
    }

    function getImageForColor(product, color) {
        if (!color) return '';
        const byColor = product.variantImages || product.imagesByColor || {};
        if (byColor && typeof byColor === 'object' && byColor[color]) return byColor[color];
        const images = Array.isArray(product.images) ? product.images : [];
        const entry = images.find(img => typeof img === 'object' && img.color === color && (img.url || img.src));
        return entry ? (entry.url || entry.src) : '';
    }

    function computeAvailableStock(product, selectedColor, selectedSize) {
        const variants = Array.isArray(product.variants) ? product.variants : [];
        const sizes = Array.isArray(product.sizes) ? product.sizes : [];
        const productStock = Number(product.stock) || 0;

        const colorStock = selectedColor
            ? Number((variants.find(v => v.color === selectedColor) || {}).stock)
            : NaN;
        const sizeStock = selectedSize
            ? Number((sizes.find(s => s.size === selectedSize) || {}).stock)
            : NaN;

        if (!Number.isNaN(colorStock) && !Number.isNaN(sizeStock)) return Math.max(0, Math.min(colorStock, sizeStock));
        if (!Number.isNaN(colorStock)) return Math.max(0, colorStock);
        if (!Number.isNaN(sizeStock)) return Math.max(0, sizeStock);
        return Math.max(0, productStock);
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // =====================================================
    // CATEGORÍAS FIJAS (misma lista que el panel de admin)
    // =====================================================

    const PRODUCTION_LINES = [
        { id: 'F1', label: 'Fórmula 1', available: true },
        { id: 'TC', label: 'Turismo Carretera (TC)', available: true }
    ];
    const ALL_CATEGORIES = ['Remeras', 'Buzos', 'Pantalones', 'Gorras'];

    // Estado del filtro de dos niveles
    const filterState = { line: 'F1', category: 'all' };

    function loadCategories() {
        const nav = document.querySelector('.category-list .line-nav');
        if (!nav) return;

        nav.innerHTML = PRODUCTION_LINES.map(l => {
            // Línea aún no disponible: título atenuado con badge, sin subcategorías.
            if (!l.available) {
                return `
                    <li class="line-group line-group--soon" aria-disabled="true">
                        <h3 class="line-group__title line-group__title--soon">${l.label} <span class="category-soon-badge">PRÓXIMAMENTE</span></h3>
                    </li>`;
            }

            const items = [{ category: 'all', label: 'Ver todos' }]
                .concat(ALL_CATEGORIES.map(cat => ({ category: cat, label: cat })));

            const lis = items.map(it => {
                const active = (filterState.line === l.id && filterState.category === it.category) ? ' active' : '';
                return `<li class="cat-item${active}" data-line="${l.id}" data-category="${it.category}">${it.label}</li>`;
            }).join('');

            return `
                <li class="line-group">
                    <h3 class="line-group__title">${l.label}</h3>
                    <ul class="cat-list">${lis}</ul>
                </li>`;
        }).join('');

        initCategoryFilters();
    }

    // =====================================================
    // FILTRO DE CATEGORÍAS
    // =====================================================
    
    async function applyCategoryFromQuery() {
        const params = new URLSearchParams(window.location.search);
        const lineParam = (params.get('line') || '').toLowerCase().trim();
        const catParam = (params.get('cat') || '').toLowerCase().replace(/\+/g, ' ').trim();
        if (!lineParam && !catParam) return;

        const items = document.querySelectorAll('.category-list .cat-item');
        let match = null;
        items.forEach(li => {
            if (match) return;
            const liLine = (li.getAttribute('data-line') || '').toLowerCase();
            const liCat = (li.getAttribute('data-category') || '').toLowerCase();
            const lineOk = !lineParam || liLine === lineParam;
            const catOk = catParam
                ? (liCat === catParam || liCat.replace(/\s+/g, '-') === catParam.replace(/\s+/g, '-'))
                : liCat === 'all';
            if (lineOk && catOk) match = li;
        });

        if (match) {
            items.forEach(i => i.classList.remove('active'));
            match.classList.add('active');
            filterState.line = match.getAttribute('data-line');
            filterState.category = match.getAttribute('data-category');
            await loadProducts();
        }
    }

    function initCategoryFilters() {
        const items = document.querySelectorAll('.category-list .cat-item');

        items.forEach(item => {
            item.addEventListener('click', async function () {
                items.forEach(i => i.classList.remove('active'));
                this.classList.add('active');
                filterState.line = this.getAttribute('data-line');
                filterState.category = this.getAttribute('data-category');
                // En mobile, cerrar el panel al elegir para liberar espacio.
                const list = document.querySelector('.category-list');
                if (list) {
                    list.classList.remove('open');
                    const btn = list.querySelector('.category-toggle');
                    if (btn) btn.setAttribute('aria-expanded', 'false');
                }
                await loadProducts();
            });
        });
    }

    // =====================================================
    // ANIMACIÓN: miniatura hacia el carrito flotante
    // =====================================================

    function flyProductToCart(triggerEl, imageSrc) {
        const cartBtn = document.querySelector('.btn-cart');
        if (!cartBtn || !triggerEl) return;

        const from = triggerEl.getBoundingClientRect();
        const to = cartBtn.getBoundingClientRect();
        const size = Math.min(44, Math.max(32, from.width * 0.35));
        const el = document.createElement('div');
        el.className = 'cart-fly-particle';
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.left = `${from.left + from.width / 2 - size / 2}px`;
        el.style.top = `${from.top + from.height / 2 - size / 2}px`;
        if (imageSrc) {
            el.style.backgroundImage = `url(${JSON.stringify(imageSrc)})`;
            el.style.backgroundSize = 'cover';
            el.style.backgroundColor = 'transparent';
        }
        document.body.appendChild(el);

        const dx = to.left + to.width / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height / 2);
        const duration = 480;

        requestAnimationFrame(() => {
            el.style.transition = `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${duration}ms ease-out`;
            el.style.transform = `translate(${dx}px, ${dy}px) scale(0.2)`;
            el.style.opacity = '0.35';
        });

        window.setTimeout(() => el.remove(), duration + 80);
    }

    // =====================================================
    // FINALIZAR: carrito + mismo flujo que checkout MP
    // =====================================================

    function goToCheckoutFlow() {
        const offcanvasEl = document.getElementById('offcanvasRight');
        const checkoutBtn = document.getElementById('checkout-btn');
        if (!checkoutBtn) return;

        if (!offcanvasEl || typeof bootstrap === 'undefined') {
            checkoutBtn.click();
            return;
        }

        if (offcanvasEl.classList.contains('show')) {
            checkoutBtn.click();
            return;
        }

        const oc = bootstrap.Offcanvas.getOrCreateInstance(offcanvasEl);
        offcanvasEl.addEventListener(
            'shown.bs.offcanvas',
            () => {
                checkoutBtn.click();
            },
            { once: true }
        );
        oc.show();
    }

    // =====================================================
    // CARRITO — operaciones genéricas sobre un "contexto"
    // El contexto es un elemento con los data-* de selección y los controles
    // dentro (hoy: el diálogo del quick-view modal).
    // =====================================================

    function isItemInCart(ctx) {
        const id = ctx.getAttribute('data-id');
        const color = ctx.getAttribute('data-selected-color') || '';
        const size = ctx.getAttribute('data-selected-size') || '';
        const cart = JSON.parse(localStorage.getItem('cart')) || [];
        return cart.some(item =>
            item.id === id &&
            (item.variantColor || '') === color &&
            (item.variantSize || '') === size
        );
    }

    function removeItemFromCart(ctx) {
        const productId = ctx.getAttribute('data-id');
        const variantColor = ctx.getAttribute('data-selected-color') || '';
        const variantSize = ctx.getAttribute('data-selected-size') || '';

        let cart = JSON.parse(localStorage.getItem('cart')) || [];
        cart = cart.filter(item =>
            !(item.id === productId &&
                (item.variantColor || '') === variantColor &&
                (item.variantSize || '') === variantSize)
        );
        localStorage.setItem('cart', JSON.stringify(cart));

        updateCartBadge();
        window.dispatchEvent(new CustomEvent('cartUpdated'));
    }

    function addItemToCart(ctx, triggerBtn) {
        const productId = ctx.getAttribute('data-id');
        const productTitle = ctx.getAttribute('data-name') || '';
        const productPrice = parseFloat(ctx.getAttribute('data-price'));
        const variantColor = ctx.getAttribute('data-selected-color') || '';
        const variantSize = ctx.getAttribute('data-selected-size') || '';
        const quantity = Math.max(1, parseInt(ctx.getAttribute('data-selected-qty') || '1', 10) || 1);
        const stock = Math.max(0, parseInt(ctx.getAttribute('data-stock') || '0', 10) || 0);

        if (stock <= 0) return;

        const imgEl = ctx.querySelector('[data-cart-img]');
        const imageSrc = imgEl ? (imgEl.getAttribute('src') || '') : '';

        let cart = JSON.parse(localStorage.getItem('cart')) || [];
        const existingItem = cart.find(item =>
            item.id === productId &&
            (item.variantColor || '') === variantColor &&
            (item.variantSize || '') === variantSize
        );

        if (existingItem) {
            const nextQty = (existingItem.quantity || 0) + quantity;
            existingItem.quantity = Math.min(nextQty, stock);
            if (imageSrc && !existingItem.image) existingItem.image = imageSrc;
        } else {
            cart.push({
                id: productId,
                title: productTitle,
                price: productPrice,
                quantity,
                image: imageSrc,
                variantColor,
                variantSize
            });
        }

        localStorage.setItem('cart', JSON.stringify(cart));

        if (triggerBtn) flyProductToCart(triggerBtn, imageSrc);
        updateCartBadge();
        triggerCartBadgeBounce();
        window.dispatchEvent(new CustomEvent('cartUpdated'));
    }

    // =====================================================
    // QUICK-VIEW MODAL — detalle + compra de un producto
    // =====================================================

    let deepLinkHandled = false;
    let activeQuickView = null;

    // Mantener en sync con scripts/product-page-template.mjs (slugify/productPath):
    // genera la misma URL que las páginas estáticas creadas en el build.
    function slugify(name) {
        return String(name || '')
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            || 'producto';
    }

    function productPath(product) {
        return `/producto/${slugify(product.name)}-${product.id}.html`;
    }

    function openQuickView(product) {
        if (activeQuickView) {
            activeQuickView.remove();
            activeQuickView = null;
        }

        const variants = Array.isArray(product.variants) ? product.variants : [];
        const sizes = Array.isArray(product.sizes) ? product.sizes : [];
        const gallery = getProductGallery(product);

        const selectedColor = variants.length > 0
            ? (variants.find(v => Number(v.stock) > 0)?.color || variants[0].color)
            : '';
        const selectedSize = sizes.length > 0
            ? (sizes.find(s => Number(s.stock) > 0)?.size || sizes[0].size)
            : '';
        const initialStock = computeAvailableStock(product, selectedColor, selectedSize);
        const initialImage = getImageForColor(product, selectedColor) || gallery[0] || product.image || productImgFallback();
        const formattedPrice = product.price.toLocaleString('es-AR');

        const galleryNav = gallery.length > 1
            ? `<button type="button" class="product-quickview__nav prev" aria-label="Imagen anterior">‹</button>
               <button type="button" class="product-quickview__nav next" aria-label="Imagen siguiente">›</button>
               <div class="product-quickview__dots">${gallery.map((_, i) => `<span class="product-quickview__dot${i === 0 ? ' is-active' : ''}" data-i="${i}"></span>`).join('')}</div>`
            : '';

        const overlay = document.createElement('div');
        overlay.className = 'product-quickview';
        overlay.innerHTML = `
            <div class="product-quickview__dialog" role="dialog" aria-modal="true"
                aria-label="Detalle de ${escapeHtml(product.name || 'producto')}"
                data-id="${escapeHtml(String(product.id))}"
                data-name="${escapeHtml(product.name || '')}"
                data-price="${product.price}"
                data-selected-color="${escapeHtml(selectedColor || '')}"
                data-selected-size="${escapeHtml(selectedSize || '')}"
                data-selected-qty="1"
                data-stock="${initialStock}">
                <button type="button" class="product-quickview__close" aria-label="Cerrar">×</button>
                <div class="product-quickview__media">
                    <img class="product-quickview__img" data-cart-img src="${escapeHtml(initialImage)}" alt="${escapeHtml(product.name || 'Producto')}" role="button" tabindex="0" aria-label="Ampliar imagen" ${productImgOnerror()}>
                    ${galleryNav}
                </div>
                <div class="product-quickview__info">
                    <h2 class="product-quickview__title">${escapeHtml(product.name || '')}</h2>
                    <div class="product-price-row">
                        <p class="product-price">$${formattedPrice}</p>
                        ${renderProductTypeTag(product)}
                    </div>
                    ${product.description ? `<p class="product-quickview__desc">${escapeHtml(product.description)}</p>` : ''}
                    ${renderColorSelector(variants, selectedColor)}
                    ${renderSizeSelector(sizes, selectedSize)}
                    ${renderQuantitySelector(initialStock)}
                    <p class="product-stock ${initialStock === 0 ? 'product-stock--out' : ''}">
                        ${initialStock === 0 ? 'Sin stock ' : 'Disponibles: '}<span>${initialStock}</span>
                    </p>
                    <div class="product-buttons">
                        <button type="button" class="add-to-cart" ${initialStock === 0 ? 'disabled' : ''}>
                            ${initialStock === 0 ? 'Sin stock' : 'Añadir al carrito'}
                        </button>
                        <button type="button" class="product-finalize-btn" style="display: none;" aria-label="Finalizar compra e ir al pago">
                            Finalizar compra
                        </button>
                    </div>
                    <div class="product-quickview__share">
                        <a class="product-quickview__permalink" href="${productPath(product)}">Página del producto →</a>
                        <button type="button" class="product-quickview__share-btn">Compartir</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        document.body.classList.add('quickview-open');
        activeQuickView = overlay;

        const dialog = overlay.querySelector('.product-quickview__dialog');
        const imgEl = overlay.querySelector('.product-quickview__img');
        const swatches = overlay.querySelectorAll('.color-swatch');
        const sizeButtons = overlay.querySelectorAll('.size-btn');
        const qtyInput = overlay.querySelector('.qty-input');
        const qtyPlus = overlay.querySelector('.qty-plus');
        const qtyMinus = overlay.querySelector('.qty-minus');
        const navPrev = overlay.querySelector('.product-quickview__nav.prev');
        const navNext = overlay.querySelector('.product-quickview__nav.next');
        const dots = overlay.querySelectorAll('.product-quickview__dot');
        const addBtn = overlay.querySelector('.add-to-cart');
        const finalizeBtn = overlay.querySelector('.product-finalize-btn');
        const shareBtn = overlay.querySelector('.product-quickview__share-btn');

        if (shareBtn) {
            shareBtn.addEventListener('click', async () => {
                const url = location.origin + productPath(product);
                try {
                    if (navigator.share) {
                        await navigator.share({ title: product.name, url });
                    } else {
                        await navigator.clipboard.writeText(url);
                        shareBtn.textContent = 'Link copiado ✓';
                        setTimeout(() => { shareBtn.textContent = 'Compartir'; }, 2000);
                    }
                } catch (e) { /* usuario canceló el share: no es error */ }
            });
        }

        let currentIndex = Math.max(0, gallery.indexOf(initialImage));

        const setGallery = (idx) => {
            if (!gallery.length) return;
            currentIndex = (idx + gallery.length) % gallery.length;
            if (imgEl) imgEl.src = gallery[currentIndex];
            dots.forEach((d, i) => d.classList.toggle('is-active', i === currentIndex));
        };

        const refresh = () => {
            const color = dialog.getAttribute('data-selected-color') || '';
            const size = dialog.getAttribute('data-selected-size') || '';
            const qty = Math.max(1, parseInt(dialog.getAttribute('data-selected-qty') || '1', 10) || 1);
            const stock = computeAvailableStock(product, color, size);
            dialog.setAttribute('data-stock', String(stock));
            updateStockUI(dialog, stock);

            if (qtyInput) {
                qtyInput.max = String(Math.max(1, stock));
                const nextQty = Math.min(Math.max(1, qty), Math.max(1, stock));
                qtyInput.value = String(nextQty);
                dialog.setAttribute('data-selected-qty', String(nextQty));
            }

            const colorImg = getImageForColor(product, color);
            if (colorImg) {
                const gi = gallery.indexOf(colorImg);
                if (gi >= 0) setGallery(gi);
                else if (imgEl) imgEl.src = colorImg;
            }

            const inCart = isItemInCart(dialog);
            if (addBtn) {
                if (stock <= 0) {
                    addBtn.disabled = true;
                    addBtn.innerText = 'Sin stock';
                    addBtn.classList.remove('add-to-cart--in-cart');
                    if (finalizeBtn) finalizeBtn.style.display = 'none';
                } else if (inCart) {
                    addBtn.disabled = false;
                    addBtn.innerText = 'Eliminar del carrito';
                    addBtn.classList.add('add-to-cart--in-cart');
                    if (finalizeBtn) finalizeBtn.style.display = 'flex';
                } else {
                    addBtn.disabled = false;
                    addBtn.innerText = 'Añadir al carrito';
                    addBtn.classList.remove('add-to-cart--in-cart');
                    if (finalizeBtn) finalizeBtn.style.display = 'none';
                }
            }
        };
        overlay._refresh = refresh;

        const onKey = (event) => {
            // Si hay un lightbox de zoom encima, Esc lo cierra a él primero.
            if (event.key === 'Escape' && !document.querySelector('.product-lightbox')) {
                closeQuickView();
            }
        };

        const closeQuickView = () => {
            if (!activeQuickView) return;
            document.removeEventListener('keydown', onKey);
            document.body.classList.remove('quickview-open');
            overlay.remove();
            activeQuickView = null;
        };

        overlay.querySelector('.product-quickview__close').addEventListener('click', closeQuickView);
        overlay.addEventListener('click', function(event) {
            if (event.target === overlay) closeQuickView();
        });
        document.addEventListener('keydown', onKey);

        if (navPrev) navPrev.addEventListener('click', () => setGallery(currentIndex - 1));
        if (navNext) navNext.addEventListener('click', () => setGallery(currentIndex + 1));
        dots.forEach(dot => dot.addEventListener('click', () => setGallery(parseInt(dot.getAttribute('data-i'), 10) || 0)));

        if (imgEl) {
            const openZoom = () => openLightbox(product, imgEl.getAttribute('src') || '');
            imgEl.addEventListener('click', openZoom);
            imgEl.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') openZoom(); });
        }

        swatches.forEach(swatch => {
            swatch.addEventListener('click', function() {
                swatches.forEach(s => s.classList.remove('is-active'));
                this.classList.add('is-active');
                dialog.setAttribute('data-selected-color', this.getAttribute('data-color') || '');
                refresh();
            });
        });

        sizeButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                if (this.disabled) return;
                sizeButtons.forEach(b => b.classList.remove('is-active'));
                this.classList.add('is-active');
                dialog.setAttribute('data-selected-size', this.getAttribute('data-size') || '');
                refresh();
            });
        });

        if (qtyMinus && qtyInput) {
            qtyMinus.addEventListener('click', function() {
                const next = Math.max(1, (parseInt(qtyInput.value, 10) || 1) - 1);
                qtyInput.value = String(next);
                dialog.setAttribute('data-selected-qty', String(next));
            });
        }
        if (qtyPlus && qtyInput) {
            qtyPlus.addEventListener('click', function() {
                const max = parseInt(qtyInput.max, 10) || 1;
                const next = Math.min(max, (parseInt(qtyInput.value, 10) || 1) + 1);
                qtyInput.value = String(next);
                dialog.setAttribute('data-selected-qty', String(next));
            });
        }
        if (qtyInput) {
            qtyInput.addEventListener('change', function() {
                const max = parseInt(this.max, 10) || 1;
                const normalized = Math.min(max, Math.max(1, parseInt(this.value, 10) || 1));
                this.value = String(normalized);
                dialog.setAttribute('data-selected-qty', String(normalized));
            });
        }

        if (addBtn) {
            addBtn.addEventListener('click', function() {
                if (isItemInCart(dialog)) {
                    removeItemFromCart(dialog);
                } else {
                    addItemToCart(dialog, this);
                }
                refresh();
            });
        }
        if (finalizeBtn) {
            finalizeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                closeQuickView();
                goToCheckoutFlow();
            });
        }

        refresh();
    }

    // =====================================================
    // ACTUALIZAR BADGE DEL CARRITO
    // =====================================================
    
    function updateCartBadge() {
        const cart = JSON.parse(localStorage.getItem('cart')) || [];
        const badge = document.getElementById('cartBadge');
        
        if (badge) {
            const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
            
            if (itemCount > 0) {
                badge.textContent = itemCount > 99 ? '99+' : itemCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    function triggerCartBadgeBounce() {
        const badge = document.getElementById('cartBadge');
        if (!badge) return;
        badge.classList.remove('cart-bounce');
        void badge.offsetWidth;
        badge.classList.add('cart-bounce');
    }

    // =====================================================
    // ANIMACIONES CSS
    // =====================================================
    
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    `;
    document.head.appendChild(styleSheet);

    // =====================================================
    // LIGHTBOX
    // =====================================================
    let activeLightbox = null;
    function openLightbox(product, currentSrc) {
        const gallery = getProductGallery(product);
        if (!gallery.length) return;

        const startIndex = Math.max(0, gallery.indexOf(currentSrc));
        let currentIndex = startIndex >= 0 ? startIndex : 0;

        const overlay = document.createElement('div');
        overlay.className = 'product-lightbox';
        overlay.innerHTML = `
            <div class="product-lightbox__dialog" role="dialog" aria-modal="true" aria-label="Imagen ampliada de ${escapeHtml(product.name || 'producto')}">
                <button type="button" class="product-lightbox__close" aria-label="Cerrar">×</button>
                <img class="product-lightbox__img" src="${escapeHtml(gallery[currentIndex])}" alt="${escapeHtml(product.name || 'Producto')}" ${productImgOnerror()} />
                ${gallery.length > 1 ? '<button type="button" class="product-lightbox__nav prev" aria-label="Imagen anterior">‹</button><button type="button" class="product-lightbox__nav next" aria-label="Imagen siguiente">›</button>' : ''}
            </div>
        `;
        document.body.appendChild(overlay);
        document.body.classList.add('lightbox-open');
        activeLightbox = overlay;

        const imgEl = overlay.querySelector('.product-lightbox__img');
        const closeBtn = overlay.querySelector('.product-lightbox__close');
        const prevBtn = overlay.querySelector('.product-lightbox__nav.prev');
        const nextBtn = overlay.querySelector('.product-lightbox__nav.next');

        const syncImage = () => {
            if (imgEl) imgEl.src = gallery[currentIndex];
        };

        const handleKey = (event) => {
            if (event.key === 'Escape') closeLightbox();
            if (event.key === 'ArrowLeft' && gallery.length > 1) {
                currentIndex = (currentIndex - 1 + gallery.length) % gallery.length;
                syncImage();
            }
            if (event.key === 'ArrowRight' && gallery.length > 1) {
                currentIndex = (currentIndex + 1) % gallery.length;
                syncImage();
            }
        };

        const closeLightbox = () => {
            if (!activeLightbox) return;
            document.removeEventListener('keydown', handleKey);
            document.body.classList.remove('lightbox-open');
            activeLightbox.remove();
            activeLightbox = null;
        };

        if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
        overlay.addEventListener('click', function(event) {
            if (event.target === overlay) closeLightbox();
        });
        if (prevBtn) prevBtn.addEventListener('click', function() {
            currentIndex = (currentIndex - 1 + gallery.length) % gallery.length;
            syncImage();
        });
        if (nextBtn) nextBtn.addEventListener('click', function() {
            currentIndex = (currentIndex + 1) % gallery.length;
            syncImage();
        });

        document.addEventListener('keydown', handleKey);
    }

    // =====================================================
    // INICIALIZACIÓN
    // =====================================================
    
    // Toggle colapsable del sidebar (solo relevante en mobile vía CSS)
    (function initCategoryToggle() {
        const list = document.querySelector('.category-list');
        const btn = list && list.querySelector('.category-toggle');
        if (!btn) return;
        btn.addEventListener('click', function () {
            const open = list.classList.toggle('open');
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
    })();

    // Cargar categorías y productos al iniciar
    loadCategories();
    await loadProducts();
    await applyCategoryFromQuery();
    updateCartBadge();

    // Escuchar actualizaciones del carrito (desde main.js cuando se elimina)
    window.addEventListener('cartUpdated', function() {
        updateCartBadge();
        // Si el quick-view está abierto, reflejar el estado del carrito.
        if (activeQuickView && typeof activeQuickView._refresh === 'function') {
            activeQuickView._refresh();
        }
    });
});

