/**
 * VOLT - Animations & Interactions
 * Maneja animaciones de scroll, menú móvil y efectos visuales
 */

document.addEventListener('DOMContentLoaded', function() {
    
    // =====================================================
    // MENÚ MÓVIL HAMBURGUESA
    // =====================================================
    const menuToggle = document.getElementById('menuToggle');
    const navMenu = document.getElementById('navMenu');
    const menuOverlay = document.getElementById('menuOverlay');
    const header = document.getElementById('mainHeader');

    if (menuToggle && navMenu) {
        const closeMenu = () => {
            menuToggle.classList.remove('active');
            navMenu.classList.remove('active');
            header?.classList.remove('menu-open');
            if (menuOverlay) {
                menuOverlay.classList.remove('active');
            }
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
        };

        menuToggle.addEventListener('click', function() {
            menuToggle.classList.toggle('active');
            navMenu.classList.toggle('active');
            header?.classList.toggle('menu-open');
            if (menuOverlay) {
                menuOverlay.classList.toggle('active');
            }
            // Prevenir scroll (body + html evita arrastre lateral residual en móvil)
            const lock = navMenu.classList.contains('active');
            document.body.style.overflow = lock ? 'hidden' : '';
            document.documentElement.style.overflow = lock ? 'hidden' : '';
        });

        // Cerrar menú al hacer clic en el overlay
        if (menuOverlay) {
            menuOverlay.addEventListener('click', function() {
                closeMenu();
            });
        }

        // Cerrar menú al hacer clic en un enlace
        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', function() {
                closeMenu();
            });
        });

        window.addEventListener('resize', function() {
            if (window.innerWidth > 768) {
                closeMenu();
            }
        });
    }

    // =====================================================
    // HEADER CON EFECTO AL SCROLL
    // =====================================================
    if (header) {
        let lastScroll = 0;
        
        window.addEventListener('scroll', function() {
            const currentScroll = window.pageYOffset;
            
            // Agregar clase cuando se hace scroll
            if (currentScroll > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
            
            lastScroll = currentScroll;
        });
    }

    // =====================================================
    // ANIMACIONES DE SCROLL REVEAL
    // =====================================================
    const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
    
    function checkReveal() {
        const windowHeight = window.innerHeight;
        const revealPoint = 150;

        revealElements.forEach(element => {
            const elementTop = element.getBoundingClientRect().top;
            
            if (elementTop < windowHeight - revealPoint) {
                element.classList.add('active');
            }
        });
    }

    // Ejecutar al cargar y al hacer scroll
    checkReveal();
    window.addEventListener('scroll', checkReveal);

    // =====================================================
    // SMOOTH SCROLL PARA ENLACES INTERNOS
    // =====================================================
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href !== '#') {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });

    // =====================================================
    // EFECTO PARALLAX SUAVE EN HERO (opcional)
    // =====================================================
    const hero = document.querySelector('.hero');
    
    if (hero) {
        window.addEventListener('scroll', function() {
            const scrolled = window.pageYOffset;
            const rate = scrolled * 0.3;
            
            if (scrolled < window.innerHeight) {
                hero.style.backgroundPositionY = rate + 'px';
            }
        });
    }

});

// =====================================================
// LAZY LOADING DE IMÁGENES (nativo con fallback)
// =====================================================
if ('loading' in HTMLImageElement.prototype) {
    // El navegador soporta lazy loading nativo
    const images = document.querySelectorAll('img[loading="lazy"]');
    images.forEach(img => {
        if (img.dataset.src) {
            img.src = img.dataset.src;
        }
    });
} else {
    // Fallback para navegadores antiguos
    const lazyImages = document.querySelectorAll('img[loading="lazy"]');
    
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                }
                img.classList.add('loaded');
                observer.unobserve(img);
            }
        });
    });

    lazyImages.forEach(img => imageObserver.observe(img));
}

// =====================================================
// TRANSICIONES ENTRE PÁGINAS
// =====================================================
// Movido a `js/volt-motion.js` → `initPageTransitions()`. Cada página la
// importa explícitamente en su <script type="module">. El CSS de
// `body.page-leaving` / `.page-shell.page-leaving` queda como fallback
// cuando Motion no logra cargar desde el CDN.
