/**
 * DRS Store - Sistema de Carrito
 * Maneja el carrito de compras con localStorage
 */

document.addEventListener("DOMContentLoaded", function () {
    // Obtener carrito del localStorage o crear uno vacío
    let cart = JSON.parse(localStorage.getItem("cart")) || [];
    
    const cartList = document.getElementById("cart-items");
    const cartTotal = document.getElementById("cart-total");
    const clearCartBtn = document.getElementById("clear-cart");
    const checkoutBtn = document.getElementById("checkout-btn");
    const cartEmptyEl = document.getElementById("cart-empty");
    const addToCartButtons = document.querySelectorAll(".add-to-cart");
    const cartBadge = document.getElementById("cartBadge");

    function cartImgFallback() {
        return window.ProductsService?.getProductImageFallback?.()
            || '../images-brand/Isotipo color.png';
    }

    function cartImgOnerrorAttr() {
        return window.ProductsService?.getProductImageOnerrorAttr?.()
            || 'onerror="this.src=\'../images-brand/Isotipo color.png\'; this.onerror=null;"';
    }

    // =====================================================
    // AGREGAR PRODUCTO AL CARRITO
    // =====================================================
    function addToCart(event) {
        const button = event.target;
        const productCard = button.closest(".product-card");
        const productId = productCard.getAttribute("data-id");
        const productTitle = productCard.querySelector(".product-title").innerText;
        const productPrice = parseFloat(productCard.getAttribute("data-price"));
        const productImgEl = productCard.querySelector(".product-image");
        const productImage = productImgEl ? productImgEl.getAttribute("src") || "" : "";

        // Verificar si el producto ya está en el carrito
        const existingItem = cart.find(item => item.id === productId);
        
        if (existingItem) {
            existingItem.quantity++;
            if (productImage && !existingItem.image) {
                existingItem.image = productImage;
            }
        } else {
            cart.push({ 
                id: productId, 
                title: productTitle, 
                price: productPrice, 
                quantity: 1,
                image: productImage
            });
        }

        // Actualizar UI
        updateCart();
        
        // Feedback visual
        button.innerText = "✓ Añadido";
        button.disabled = true;
        button.style.background = "var(--volt-ds-black, #000)";
        
        // Animación del badge
        triggerCartBadgeBounce();
    }

    // =====================================================
    // ELIMINAR PRODUCTO (Event Delegation)
    // =====================================================
    if (cartList) {
        cartList.addEventListener("click", function (event) {
            if (event.target.classList.contains("remove-item")) {
                const index = event.target.getAttribute("data-index");
                
                // Animación de eliminación
                const item = event.target.closest('li');
                if (item) {
                    item.style.animation = 'slideOut 0.3s ease forwards';
                    setTimeout(() => {
                        cart.splice(index, 1);
                        updateCart();
                        resetButtons();
                        // Notificar a catalog.js para actualizar los botones de las cards
                        window.dispatchEvent(new CustomEvent('cartUpdated'));
                    }, 300);
                } else {
                    cart.splice(index, 1);
                    updateCart();
                    resetButtons();
                    window.dispatchEvent(new CustomEvent('cartUpdated'));
                }
            }
        });
    }

    // =====================================================
    // ACTUALIZAR CARRITO EN DOM Y LOCALSTORAGE
    // =====================================================
    function updateCart() {
        if (!cartList || !cartTotal) return;
        
        cartList.innerHTML = "";
        let total = 0;
        let itemCount = 0;

        const hasItems = cart.length > 0;

        if (cartEmptyEl) {
            cartEmptyEl.hidden = hasItems;
        }

        cart.forEach((item, index) => {
            total += item.price * item.quantity;
            itemCount += item.quantity;

            const imgSrc = window.ProductsService?.sanitizeImageUrl?.(item.image)
                || item.image
                || cartImgFallback();
            const imgSrcSafe = String(imgSrc)
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;');

            const li = document.createElement("li");
            li.classList.add("cart-item");
            // Identidad estable de la línea (id + color + talle) para que volt-motion.js
            // pueda hacer FLIP cuando un item del medio se elimina y los otros bajan.
            li.dataset.lineKey = `${item.id || ''}-${item.variantColor || ''}-${item.variantSize || ''}`;
            li.style.animation = 'slideIn 0.3s ease forwards';
            li.innerHTML = `
                <img class="cart-item__thumb" src="${imgSrcSafe}" alt="" width="64" height="64" loading="lazy" ${cartImgOnerrorAttr()}>
                <div class="cart-item__body">
                    <div class="cart-item__title">${item.title}</div>
                    <div class="cart-item__meta">x${item.quantity} - $${(item.price * item.quantity).toLocaleString('es-AR')}</div>
                </div>
                <button type="button" class="cart-item__remove remove-item" data-index="${index}" aria-label="Quitar del carrito">
                    ✕
                </button>
            `;
            cartList.appendChild(li);
        });

        cartTotal.innerText = `$${total.toLocaleString('es-AR')}`;

        const transferTotalEl = document.getElementById('cart-transfer-total');
        if (transferTotalEl) {
            transferTotalEl.innerText = `$${Math.round(total * 0.9).toLocaleString('es-AR')}`;
        }

        localStorage.setItem("cart", JSON.stringify(cart));

        updateBadge(itemCount);

        // Mostrar/ocultar totales y botones según si hay items
        const display = hasItems ? '' : 'none';

        const cartTotalRow = document.querySelector('.cart-total-row');
        const cartTransferRow = document.getElementById('cart-transfer-row');
        if (cartTotalRow)    cartTotalRow.style.display    = display;
        if (cartTransferRow) cartTransferRow.style.display = display;

        if (clearCartBtn) {
            clearCartBtn.disabled = !hasItems;
            clearCartBtn.style.display = display;
        }
        if (checkoutBtn) {
            checkoutBtn.disabled = !hasItems;
            checkoutBtn.style.display = display;
        }
        const transferBtn = document.getElementById('transfer-btn');
        if (transferBtn) {
            transferBtn.disabled = !hasItems;
            transferBtn.style.display = display;
        }

        updateButtons();

        // Persistir en Firestore si hay sesión activa
        window.VoltCartSync?.onCartChange([...cart]);
    }

    // =====================================================
    // BADGE DEL CARRITO
    // =====================================================
    function updateBadge(count) {
        if (!cartBadge) return;
        
        if (count > 0) {
            cartBadge.textContent = count > 99 ? '99+' : count;
            cartBadge.style.display = 'flex';
        } else {
            cartBadge.style.display = 'none';
        }
    }

    function triggerCartBadgeBounce() {
        if (!cartBadge) return;
        cartBadge.classList.remove("cart-bounce");
        void cartBadge.offsetWidth;
        cartBadge.classList.add("cart-bounce");
    }

    // =====================================================
    // RESTAURAR BOTONES "AÑADIR AL CARRITO"
    // =====================================================
    function resetButtons() {
        addToCartButtons.forEach(button => {
            const productCard = button.closest(".product-card");
            const productId = productCard.getAttribute("data-id");
            const inCart = cart.some(item => item.id === productId);

            if (!inCart) {
                button.innerText = "Añadir al carrito";
                button.disabled = false;
                button.style.background = "";
            }
        });
    }

    // =====================================================
    // ACTUALIZAR BOTONES SEGÚN CARRITO
    // =====================================================
    function updateButtons() {
        addToCartButtons.forEach(button => {
            const productCard = button.closest(".product-card");
            const productId = productCard.getAttribute("data-id");
            const inCart = cart.some(item => item.id === productId);

            if (inCart) {
                button.innerText = "✓ Añadido";
                button.disabled = true;
                button.style.background = "var(--volt-ds-black, #000)";
            } else {
                button.innerText = "Añadir al carrito";
                button.disabled = false;
                button.style.background = "";
            }
        });
    }

    // =====================================================
    // VACIAR CARRITO
    // =====================================================
    if (clearCartBtn) {
        clearCartBtn.addEventListener("click", function () {
            // Confirmación
            if (cart.length === 0) return;
            
            // Animación de vaciado
            const items = cartList.querySelectorAll('li');
            items.forEach((item, index) => {
                setTimeout(() => {
                    item.style.animation = 'slideOut 0.2s ease forwards';
                }, index * 50);
            });

            setTimeout(() => {
                cart.length = 0;
                updateCart();
                resetButtons();
                // Notificar a catalog.js para actualizar todos los botones
                window.dispatchEvent(new CustomEvent('cartUpdated'));
            }, items.length * 50 + 200);
        });
    }

    // =====================================================
    // EVENT LISTENERS PARA BOTONES
    // =====================================================
    addToCartButtons.forEach(button => {
        button.addEventListener("click", addToCart);
    });

    // =====================================================
    // ANIMACIONES CSS
    // =====================================================
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateX(-20px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }
        
        @keyframes slideOut {
            from {
                opacity: 1;
                transform: translateX(0);
            }
            to {
                opacity: 0;
                transform: translateX(20px);
            }
        }
    `;
    document.head.appendChild(styleSheet);

    // Cargar carrito al iniciar
    updateCart();

    // Escuchar actualizaciones del carrito desde catalog.js
    window.addEventListener('cartUpdated', function() {
        // Recargar carrito desde localStorage
        cart = JSON.parse(localStorage.getItem("cart")) || [];
        updateCart();
    });
});
