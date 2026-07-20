/**
 * Home — productos destacados (solo lectura, enlaza al shop).
 */
(function () {
    'use strict';

    function productImgFallback() {
        return window.ProductsService?.getProductImageFallback?.()
            || 'images-brand/Isotipo color.png';
    }

    function productImgOnerror() {
        return window.ProductsService?.getProductImageOnerrorAttr?.()
            || 'onerror="this.src=\'images-brand/Isotipo color.png\'; this.onerror=null;"';
    }

    function firstProductImage(product) {
        const images = Array.isArray(product.images) ? product.images : [];
        const urls = images
            .map((img) => {
                if (typeof img === 'string') return img.trim();
                if (img && typeof img === 'object') return (img.url || img.src || '').trim();
                return '';
            })
            .filter(Boolean);
        const main = (product.image || product.imageUrl || '').trim();
        if (main && !urls.includes(main)) urls.unshift(main);
        return urls[0] || productImgFallback();
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /* Flechas prev/next del carrusel (los botones viven en index.html).
       Se llama después del render: sin cards no hay overflow y ambos
       botones quedan disabled. */
    function setupCarouselNav(grid) {
        const prev = document.getElementById('homeFeaturedPrev');
        const next = document.getElementById('homeFeaturedNext');
        if (!prev || !next) return;

        function step() {
            const card = grid.firstElementChild;
            if (!card) return 0;
            const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
            return card.getBoundingClientRect().width + gap;
        }

        function behavior() {
            return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
        }

        function update() {
            prev.disabled = grid.scrollLeft <= 0;
            next.disabled = grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 1;
        }

        prev.addEventListener('click', function () {
            grid.scrollBy({ left: -step(), behavior: behavior() });
        });
        next.addEventListener('click', function () {
            grid.scrollBy({ left: step(), behavior: behavior() });
        });
        grid.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        update();
    }

    document.addEventListener('DOMContentLoaded', async function () {
        const grid = document.getElementById('homeFeaturedGrid');
        const statusEl = document.getElementById('homeFeaturedStatus');
        if (!grid || !window.ProductsService) return;

        if (window.FirebaseConfig) window.FirebaseConfig.init();

        try {
            const products = await window.ProductsService.getAll();
            const limit = Math.max(1, Number(grid.dataset.limit) || 6);
            const flagged = products
                .filter((p) => p.featured === true)
                .sort((a, b) => (a.featuredOrder ?? Infinity) - (b.featuredOrder ?? Infinity));
            const featured = (flagged.length ? flagged : products).slice(0, limit);

            if (!featured.length) {
                grid.innerHTML = '';
                if (statusEl) {
                    statusEl.hidden = false;
                    statusEl.textContent = 'Pronto cargaremos el catálogo acá. Entrá al shop para ver todo.';
                }
                return;
            }

            if (statusEl) statusEl.hidden = true;

            grid.innerHTML = featured
                .map((p) => {
                    const img = escapeHtml(firstProductImage(p));
                    const name = escapeHtml(p.name || 'Producto');
                    const price = Number(p.price) || 0;
                    const formatted = price.toLocaleString('es-AR');
                    return `
                        <article class="home-featured-card">
                            <a href="/pages/catalogo.html" class="home-featured-card__link" aria-label="Ver ${name} en el shop">
                                <div class="home-featured-card__media">
                                    <img src="${img}" alt="${name}" class="home-featured-card__img" width="480" height="600" loading="lazy" decoding="async" ${productImgOnerror()}>
                                    <div class="home-featured-card__overlay" aria-hidden="true">
                                        <span class="home-featured-card__cta">Ver en shop</span>
                                    </div>
                                </div>
                                <div class="home-featured-card__body">
                                    <h3 class="home-featured-card__title">${name}</h3>
                                    <p class="home-featured-card__price">$${formatted}</p>
                                </div>
                            </a>
                        </article>
                    `;
                })
                .join('');

            setupCarouselNav(grid);
        } catch (err) {
            console.error('home-featured:', err);
            grid.innerHTML = '';
            if (statusEl) {
                statusEl.hidden = false;
                statusEl.textContent = 'No pudimos cargar productos. Probá el shop.';
            }
        }
    });
})();
