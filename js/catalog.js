/**
 * DRS Store - Catalog Manager
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

                // Inicializar botones de carrito para los nuevos productos
                initCartButtons();
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

        // Verificar si está en el carrito
        const variants = Array.isArray(product.variants) ? product.variants : [];
        const sizes = Array.isArray(product.sizes) ? product.sizes : [];
        const gallery = getProductGallery(product);
        const initialImageRaw = gallery[0] || product.image || productImgFallback();
        const initialImage = escapeHtml(initialImageRaw);

        const selectedColor = variants.length > 0 ? variants.find(v => Number(v.stock) > 0)?.color || variants[0].color : '';
        const selectedSize = sizes.length > 0 ? sizes.find(s => Number(s.stock) > 0)?.size || sizes[0].size : '';
        const initialStock = computeAvailableStock(product, selectedColor, selectedSize);

        card.setAttribute('data-selected-color', selectedColor || '');
        card.setAttribute('data-selected-size', selectedSize || '');
        card.setAttribute('data-selected-qty', '1');
        card.setAttribute('data-stock', initialStock);

        const cart = JSON.parse(localStorage.getItem('cart')) || [];
        const inCart = cart.some(item =>
            item.id === product.id &&
            (item.variantColor || '') === (selectedColor || '') &&
            (item.variantSize || '') === (selectedSize || '')
        );

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
                <button type="button" class="product-expand-toggle" aria-expanded="false" aria-label="Ver producto ${escapeHtml(product.name)}">
                    <span class="product-expand-label">Ver producto →</span>
                </button>
            </div>
            <div class="product-expanded">
                <div class="product-expanded-inner">
                    ${renderColorSelector(variants, selectedColor)}
                    ${renderSizeSelector(sizes, selectedSize)}
                    ${renderQuantitySelector(initialStock)}
                    <p class="product-stock ${initialStock === 0 ? 'product-stock--out' : ''}">
                        ${initialStock === 0 ? 'Sin stock' : 'Disponibles: '}<span>${initialStock}</span>
                    </p>
                    <div class="product-buttons">
                        <button type="button" class="add-to-cart ${inCart ? 'add-to-cart--in-cart' : ''}" ${initialStock === 0 ? 'disabled' : ''}>
                            ${initialStock === 0 ? 'Sin stock' : inCart ? 'Eliminar del carrito' : 'Añadir al carrito'}
                        </button>
                        <button type="button" class="product-finalize-btn" style="display: ${inCart ? 'flex' : 'none'};" aria-label="Finalizar compra e ir al pago">
                            Finalizar compra
                        </button>
                    </div>
                </div>
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
        const swatches = card.querySelectorAll('.color-swatch');
        const sizeButtons = card.querySelectorAll('.size-btn');
        const qtyInput = card.querySelector('.qty-input');
        const qtyPlus = card.querySelector('.qty-plus');
        const qtyMinus = card.querySelector('.qty-minus');

        const getState = () => ({
            color: card.getAttribute('data-selected-color') || '',
            size: card.getAttribute('data-selected-size') || '',
            qty: Math.max(1, parseInt(card.getAttribute('data-selected-qty') || '1', 10) || 1)
        });

        const refreshState = () => {
            const state = getState();
            const stock = computeAvailableStock(product, state.color, state.size);
            card.setAttribute('data-stock', String(stock));
            updateStockUI(card, stock);

            const nextImage = getImageForColor(product, state.color) || getProductGallery(product)[0] || product.image;
            if (imageEl && nextImage) imageEl.src = nextImage;

            if (qtyInput) {
                qtyInput.max = String(Math.max(1, stock));
                const nextQty = Math.min(Math.max(1, state.qty), Math.max(1, stock));
                qtyInput.value = String(nextQty);
                card.setAttribute('data-selected-qty', String(nextQty));
            }

            const addBtn = card.querySelector('.add-to-cart');
            const finalizeBtn = card.querySelector('.product-finalize-btn');
            const cart = JSON.parse(localStorage.getItem('cart')) || [];
            const inCart = cart.some(item =>
                item.id === product.id &&
                (item.variantColor || '') === (state.color || '') &&
                (item.variantSize || '') === (state.size || '')
            );
            if (addBtn) {
                const hasStock = stock > 0;
                if (!hasStock) {
                    addBtn.disabled = true;
                    addBtn.innerText = 'Sin stock';
                    addBtn.style.background = '';
                    addBtn.classList.remove('add-to-cart--in-cart');
                    if (finalizeBtn) finalizeBtn.style.display = 'none';
                    return;
                }
                if (inCart) {
                    addBtn.disabled = false;
                    addBtn.innerText = 'Eliminar del carrito';
                    addBtn.style.background = '';
                    addBtn.classList.add('add-to-cart--in-cart');
                    if (finalizeBtn) finalizeBtn.style.display = 'flex';
                } else {
                    addBtn.disabled = false;
                    addBtn.innerText = 'Añadir al carrito';
                    addBtn.style.background = '';
                    addBtn.classList.remove('add-to-cart--in-cart');
                    if (finalizeBtn) finalizeBtn.style.display = 'none';
                }
            }
        };

        const toggleExpanded = () => {
            const expanded = card.classList.toggle('is-expanded');
            if (expandToggle) {
                expandToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            }
        };

        if (expandToggle) {
            expandToggle.addEventListener('click', function(event) {
                event.stopPropagation();
                toggleExpanded();
            });
        }

        card.addEventListener('click', function(event) {
            if (
                event.target.closest('.product-image') ||
                event.target.closest('.product-expanded') ||
                event.target.closest('.product-expand-toggle') ||
                event.target.closest('button') ||
                event.target.closest('input')
            ) {
                return;
            }
            toggleExpanded();
        });

        swatches.forEach(swatch => {
            swatch.addEventListener('click', function() {
                swatches.forEach(s => s.classList.remove('is-active'));
                this.classList.add('is-active');
                card.setAttribute('data-selected-color', this.getAttribute('data-color') || '');
                refreshState();
            });
        });

        sizeButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                if (this.disabled) return;
                sizeButtons.forEach(b => b.classList.remove('is-active'));
                this.classList.add('is-active');
                card.setAttribute('data-selected-size', this.getAttribute('data-size') || '');
                refreshState();
            });
        });

        if (qtyMinus && qtyInput) {
            qtyMinus.addEventListener('click', function() {
                const next = Math.max(1, (parseInt(qtyInput.value, 10) || 1) - 1);
                qtyInput.value = String(next);
                card.setAttribute('data-selected-qty', String(next));
            });
        }
        if (qtyPlus && qtyInput) {
            qtyPlus.addEventListener('click', function() {
                const max = parseInt(qtyInput.max, 10) || 1;
                const next = Math.min(max, (parseInt(qtyInput.value, 10) || 1) + 1);
                qtyInput.value = String(next);
                card.setAttribute('data-selected-qty', String(next));
            });
        }
        if (qtyInput) {
            qtyInput.addEventListener('change', function() {
                const max = parseInt(this.max, 10) || 1;
                const normalized = Math.min(max, Math.max(1, parseInt(this.value, 10) || 1));
                this.value = String(normalized);
                card.setAttribute('data-selected-qty', String(normalized));
            });
        }

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
        { id: 'TC', label: 'Turismo Carretera (TC)', available: true },
        { id: 'F1', label: 'Fórmula 1', available: false }
    ];
    const ALL_CATEGORIES = ['Remeras', 'Buzos', 'Pantalones', 'Gorras'];

    // Estado del filtro de dos niveles
    const filterState = { line: 'TC', category: 'all' };

    function loadCategories() {
        const lineList = document.querySelector('.category-list .line-list');
        const typeList = document.querySelector('.category-list .type-list');
        if (!lineList || !typeList) return;

        lineList.innerHTML = PRODUCTION_LINES.map(l => {
            if (!l.available) {
                return `<li class="category-sidebar-soon" aria-disabled="true">${l.label} <span class="category-soon-badge">PRÓXIMAMENTE</span></li>`;
            }
            const active = l.id === filterState.line ? ' active' : '';
            return `<li class="line-item${active}" data-line="${l.id}">${l.label}</li>`;
        }).join('');

        typeList.innerHTML = `
            <li class="active" data-category="all">Ver todos</li>
            ${ALL_CATEGORIES.map(cat => `<li data-category="${cat}">${cat}</li>`).join('')}
        `;
        initCategoryFilters();
    }

    // =====================================================
    // FILTRO DE CATEGORÍAS
    // =====================================================
    
    function applyCategoryFromQuery() {
        const params = new URLSearchParams(window.location.search);
        const lineParam = (params.get('line') || '').toLowerCase().trim();
        const catParam = (params.get('cat') || '').toLowerCase().replace(/\+/g, ' ').trim();

        if (lineParam) {
            const lineLis = document.querySelectorAll('.category-list .line-item');
            lineLis.forEach(li => {
                if ((li.getAttribute('data-line') || '').toLowerCase() === lineParam) li.click();
            });
        }

        if (catParam) {
            const typeLis = document.querySelectorAll('.category-list .type-list li[data-category]');
            typeLis.forEach(li => {
                const v = (li.getAttribute('data-category') || '').toLowerCase();
                if (v === catParam || v.replace(/\s+/g, '-') === catParam.replace(/\s+/g, '-')) li.click();
            });
        }
    }

    function initCategoryFilters() {
        const lineItems = document.querySelectorAll('.category-list .line-item');
        const typeItems = document.querySelectorAll('.category-list .type-list li[data-category]');

        lineItems.forEach(item => {
            item.addEventListener('click', async function () {
                lineItems.forEach(i => i.classList.remove('active'));
                this.classList.add('active');
                filterState.line = this.getAttribute('data-line');
                await loadProducts();
            });
        });

        typeItems.forEach(item => {
            item.addEventListener('click', async function () {
                typeItems.forEach(i => i.classList.remove('active'));
                this.classList.add('active');
                filterState.category = this.getAttribute('data-category');
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
    // INICIALIZAR BOTONES DE CARRITO
    // =====================================================
    
    function initCartButtons() {
        const addToCartButtons = document.querySelectorAll('.add-to-cart');
        const finalizeButtons = document.querySelectorAll('.product-finalize-btn');
        const cart = JSON.parse(localStorage.getItem('cart')) || [];

        addToCartButtons.forEach(button => {
            const productCard = button.closest('.product-card');
            const productId = productCard.getAttribute('data-id');
            const finalizeBtn = productCard.querySelector('.product-finalize-btn');
            const selectedColor = productCard.getAttribute('data-selected-color') || '';
            const selectedSize = productCard.getAttribute('data-selected-size') || '';
            
            const inCart = cart.some(item =>
                item.id === productId &&
                (item.variantColor || '') === selectedColor &&
                (item.variantSize || '') === selectedSize
            );
            if (inCart) {
                button.innerText = 'Eliminar del carrito';
                button.disabled = false;
                button.style.background = '';
                button.classList.add('add-to-cart--in-cart');
                if (finalizeBtn) finalizeBtn.style.display = 'flex';
            }

            button.addEventListener('click', function onToggleCart() {
                const card = this.closest('.product-card');
                const pid = card.getAttribute('data-id');
                const color = card.getAttribute('data-selected-color') || '';
                const size = card.getAttribute('data-selected-size') || '';
                const currentCart = JSON.parse(localStorage.getItem('cart')) || [];
                const isInCart = currentCart.some(item =>
                    item.id === pid &&
                    (item.variantColor || '') === color &&
                    (item.variantSize || '') === size
                );
                if (isInCart) {
                    removeFromCartForCard(card);
                } else {
                    addToCart(this);
                }
            });
        });

        finalizeButtons.forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                goToCheckoutFlow();
            });
        });
    }

    // =====================================================
    // QUITAR DEL CARRITO (desde la card — toggle)
    // =====================================================
    
    function removeFromCartForCard(productCard) {
        const productId = productCard.getAttribute('data-id');
        const selectedColor = productCard.getAttribute('data-selected-color') || '';
        const selectedSize = productCard.getAttribute('data-selected-size') || '';

        let cart = JSON.parse(localStorage.getItem('cart')) || [];
        cart = cart.filter(item =>
            !(item.id === productId &&
                (item.variantColor || '') === selectedColor &&
                (item.variantSize || '') === selectedSize)
        );
        localStorage.setItem('cart', JSON.stringify(cart));

        updateCartBadge();
        window.dispatchEvent(new CustomEvent('cartUpdated'));
    }

    // =====================================================
    // AGREGAR AL CARRITO
    // =====================================================
    
    function addToCart(button) {
        const productCard = button.closest('.product-card');
        const productId = productCard.getAttribute('data-id');
        const productTitle = productCard.querySelector('.product-title').innerText;
        const productPrice = parseFloat(productCard.getAttribute('data-price'));
        const finalizeBtn = productCard.querySelector('.product-finalize-btn');
        const variantColor = productCard.getAttribute('data-selected-color') || '';
        const variantSize = productCard.getAttribute('data-selected-size') || '';
        const quantity = Math.max(1, parseInt(productCard.getAttribute('data-selected-qty') || '1', 10) || 1);
        const stock = Math.max(0, parseInt(productCard.getAttribute('data-stock') || '0', 10) || 0);

        if (stock <= 0) {
            button.innerText = 'Sin stock';
            button.disabled = true;
            return;
        }

        // Obtener carrito actual
        let cart = JSON.parse(localStorage.getItem('cart')) || [];

        // Verificar si ya existe
        const existingItem = cart.find(item =>
            item.id === productId &&
            (item.variantColor || '') === variantColor &&
            (item.variantSize || '') === variantSize
        );
        
        const productImgEl = productCard.querySelector('.product-image');
        const imageSrc = productImgEl ? (productImgEl.getAttribute('src') || '') : '';

        if (existingItem) {
            const nextQty = (existingItem.quantity || 0) + quantity;
            existingItem.quantity = Math.min(nextQty, stock);
            if (imageSrc && !existingItem.image) {
                existingItem.image = imageSrc;
            }
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

        // Guardar carrito
        localStorage.setItem('cart', JSON.stringify(cart));

        button.innerText = 'Eliminar del carrito';
        button.disabled = false;
        button.style.background = '';
        button.classList.add('add-to-cart--in-cart');
        if (finalizeBtn) finalizeBtn.style.display = 'flex';

        flyProductToCart(button, imageSrc);

        // Actualizar badge del carrito
        updateCartBadge();
        triggerCartBadgeBounce();

        // Disparar evento para que main.js actualice el carrito
        window.dispatchEvent(new CustomEvent('cartUpdated'));
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
    // ACTUALIZAR BOTONES SEGÚN EL CARRITO
    // =====================================================
    
    function refreshButtonStates() {
        const cart = JSON.parse(localStorage.getItem('cart')) || [];
        const productCards = document.querySelectorAll('.product-card');

        productCards.forEach(card => {
            const productId = card.getAttribute('data-id');
            const addBtn = card.querySelector('.add-to-cart');
            const finalizeBtn = card.querySelector('.product-finalize-btn');
            const stock = parseInt(card.getAttribute('data-stock'), 10) || 0;
            const selectedColor = card.getAttribute('data-selected-color') || '';
            const selectedSize = card.getAttribute('data-selected-size') || '';
            
            const inCart = cart.some(item =>
                item.id === productId &&
                (item.variantColor || '') === selectedColor &&
                (item.variantSize || '') === selectedSize
            );

            if (!addBtn) return;

            if (inCart) {
                addBtn.innerText = 'Eliminar del carrito';
                addBtn.disabled = false;
                addBtn.style.background = '';
                addBtn.classList.add('add-to-cart--in-cart');
                if (finalizeBtn) finalizeBtn.style.display = 'flex';
            } else {
                if (stock > 0) {
                    addBtn.innerText = 'Añadir al carrito';
                    addBtn.disabled = false;
                    addBtn.style.background = '';
                }
                addBtn.classList.remove('add-to-cart--in-cart');
                if (finalizeBtn) finalizeBtn.style.display = 'none';
            }
        });
    }

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
    
    // Cargar categorías y productos al iniciar
    loadCategories();
    await loadProducts();
    applyCategoryFromQuery();
    updateCartBadge();

    // Escuchar actualizaciones del carrito (desde main.js cuando se elimina)
    window.addEventListener('cartUpdated', function() {
        updateCartBadge();
        refreshButtonStates();
    });
});

