/**
 * VOLT Culture — Motion module
 *
 * Wrapper único alrededor de motion.dev (ESM CDN) que centraliza:
 *   - Carga lazy de la librería (un solo import por sesión).
 *   - Gate de `prefers-reduced-motion` → si está activo, devolvemos stubs
 *     que dejan el sitio funcionando sin animaciones extra.
 *   - Helpers compartidos (selector + parse de springs sensibles).
 *   - Animaciones específicas por sección (Fase 1+).
 *
 * Reglas del proyecto (CLAUDE.md):
 *   - Sin build step → import directo desde CDN.
 *   - Solo `transform` + `opacity` para mantener el compositor feliz.
 *   - Duraciones de micro-interacción 150–300 ms.
 */

const MOTION_CDN = 'https://cdn.jsdelivr.net/npm/motion@11/+esm';

const reduceMotionQuery =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

export const prefersReducedMotion = () => Boolean(reduceMotionQuery && reduceMotionQuery.matches);

let motionPromise = null;

/**
 * Carga Motion una sola vez. Si el usuario pidió reduced-motion devolvemos
 * `null` (las funciones específicas detectan esto y hacen early-return).
 */
export function loadMotion() {
    if (prefersReducedMotion()) return Promise.resolve(null);
    if (!motionPromise) {
        motionPromise = import(/* @vite-ignore */ MOTION_CDN).catch((err) => {
            console.warn('[volt-motion] No se pudo cargar Motion desde CDN.', err);
            motionPromise = null;
            return null;
        });
    }
    return motionPromise;
}

function toElements(target) {
    if (!target) return [];
    if (target instanceof Element) return [target];
    if (typeof target === 'string') return Array.from(document.querySelectorAll(target));
    if (target instanceof NodeList || Array.isArray(target)) return Array.from(target);
    return [];
}

/**
 * Spring presets pensados para la sensación "motorsport" del brand:
 * un overshoot leve, sin rebotes largos.
 */
const SPRING = {
    snappy:   { type: 'spring', stiffness: 520, damping: 32, mass: 0.9 },
    soft:     { type: 'spring', stiffness: 280, damping: 26, mass: 1 },
    overshoot:{ type: 'spring', stiffness: 380, damping: 18, mass: 0.9 },
    tap:      { type: 'spring', stiffness: 700, damping: 32, mass: 0.7 },
};

/**
 * Envuelve cada palabra de un texto en `<span>` con clases utilitarias.
 * Idempotente: si ya fue splitteado (data-volt-split), no rehace el DOM.
 *
 * Devuelve los spans listos para animar.
 */
function splitWords(el) {
    if (!el) return [];
    if (el.dataset.voltSplit === 'words') {
        return Array.from(el.querySelectorAll('.volt-word'));
    }
    const original = el.textContent || '';
    const trimmed = original.replace(/\s+/g, ' ').trim();
    if (!trimmed) return [];
    el.setAttribute('aria-label', trimmed);
    el.textContent = '';
    const words = trimmed.split(' ');
    const spans = [];
    words.forEach((word, i) => {
        const wrap = document.createElement('span');
        wrap.className = 'volt-word';
        wrap.setAttribute('aria-hidden', 'true');
        wrap.style.display = 'inline-block';
        wrap.style.willChange = 'transform, opacity';
        wrap.textContent = word;
        el.appendChild(wrap);
        spans.push(wrap);
        if (i < words.length - 1) {
            el.appendChild(document.createTextNode(' '));
        }
    });
    el.dataset.voltSplit = 'words';
    return spans;
}

// ============================================================
// FASE 1 — HERO HOME
// ============================================================

/**
 * Entrada del hero del home:
 *   - Split del headline por palabras + stagger spring (overshoot).
 *   - Sub fade-up suave (matchea el easing existente del proyecto).
 *   - Badge + CTAs entran detrás del headline.
 *   - CTAs reciben magnetic-on-hover + tap spring.
 */
export async function initHeroEntrance(rootSelector = '.hero') {
    if (typeof document === 'undefined') return;
    const root = typeof rootSelector === 'string' ? document.querySelector(rootSelector) : rootSelector;
    if (!root) return;
    if (root.dataset.voltMotionInit === '1') return;
    root.dataset.voltMotionInit = '1';

    const headline = root.querySelector('.hero__headline');
    const sub      = root.querySelector('.hero__sub');
    const badge    = root.querySelector('.hero__badge');
    const ctas     = Array.from(root.querySelectorAll('.hero__ctas .btn'));

    if (prefersReducedMotion()) {
        [headline, sub, badge, ...ctas].forEach((el) => {
            if (el) {
                el.style.opacity = '';
                el.style.transform = '';
            }
        });
        return;
    }

    // Split + hide ANTES de await: evita el flash mientras carga Motion desde CDN.
    const words = headline ? splitWordsPreservingSpans(headline) : [];
    words.forEach((w) => {
        w.style.opacity = '0';
        w.style.transform = 'translateY(0.5em)';
    });
    if (sub)   { sub.style.opacity = '0';   sub.style.transform = 'translateY(12px)'; }
    if (badge) { badge.style.opacity = '0'; badge.style.transform = 'translateY(8px)'; }
    ctas.forEach((b) => { b.style.opacity = '0'; b.style.transform = 'translateY(10px)'; });

    const restoreVisibility = () => {
        const restore = (el) => {
            if (!el) return;
            el.style.opacity = '';
            el.style.transform = '';
        };
        words.forEach(restore);
        restore(sub);
        restore(badge);
        ctas.forEach(restore);
    };

    const motion = await loadMotion();
    if (!motion) {
        // CDN no respondió: dejamos todo visible para no romper la página.
        restoreVisibility();
        return;
    }
    const { animate, stagger } = motion;

    if (badge) {
        animate(
            badge,
            { opacity: [0, 1], y: [8, 0] },
            { duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.05 }
        );
    }

    if (words.length) {
        animate(
            words,
            { opacity: [0, 1], y: ['0.5em', '0em'] },
            {
                delay: stagger(0.06, { startDelay: 0.1 }),
                ...SPRING.overshoot,
            }
        );
    }

    if (sub) {
        animate(
            sub,
            { opacity: [0, 1], y: [12, 0] },
            { duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.25 + words.length * 0.06 }
        );
    }

    if (ctas.length) {
        animate(
            ctas,
            { opacity: [0, 1], y: [10, 0] },
            {
                duration: 0.4,
                ease: [0.22, 1, 0.36, 1],
                delay: stagger(0.08, { startDelay: 0.35 + words.length * 0.05 }),
            }
        );
    }

    // Mejoras post-entrada: pulse del badge + interacciones de los CTAs.
    enhanceHeroPulse(root, motion);
    enhanceMagneticButtons(ctas, motion);
    enhanceTapButtons(ctas, motion);
}

/**
 * Pulse físico (spring loop) del puntito rojo del badge.
 * Mantiene el `@keyframes pulse-red` como fallback CSS hasta que Motion entra.
 */
function enhanceHeroPulse(root, motion) {
    const dot = root.querySelector('.hero__pulse');
    if (!dot) return;
    const { animate } = motion;
    // Reemplazamos la animación CSS para que la del JS no compita por estado.
    dot.style.animation = 'none';
    dot.style.transformOrigin = 'center';

    animate(
        dot,
        { scale: [1, 1.35, 1], opacity: [1, 0.75, 1] },
        {
            duration: 1.4,
            ease: 'easeInOut',
            repeat: Infinity,
        }
    );
}

/**
 * Magnetic hover: el botón se desplaza levemente hacia el cursor (máx ~6px).
 * Toleramos punteros gruesos: en touch el efecto se desactiva.
 */
function enhanceMagneticButtons(buttons, motion) {
    if (!buttons || !buttons.length) return;
    const fineQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (!fineQuery.matches) return;
    const { animate } = motion;
    const MAX = 6;

    buttons.forEach((btn) => {
        if (btn.dataset.voltMagnetic === '1') return;
        btn.dataset.voltMagnetic = '1';
        btn.style.willChange = 'transform';

        const onMove = (e) => {
            const rect = btn.getBoundingClientRect();
            const relX = (e.clientX - rect.left) / rect.width - 0.5;
            const relY = (e.clientY - rect.top) / rect.height - 0.5;
            animate(
                btn,
                { x: relX * MAX * 2, y: relY * MAX * 2 },
                SPRING.soft
            );
        };

        const onLeave = () => {
            animate(btn, { x: 0, y: 0 }, SPRING.snappy);
        };

        btn.addEventListener('mousemove', onMove);
        btn.addEventListener('mouseleave', onLeave);
    });
}

/**
 * Tap spring: feedback al press (mouse/touch) con scale 0.97.
 * Idempotente; convive con el `:hover` CSS porque sólo toca `transform`.
 */
function enhanceTapButtons(buttons, motion) {
    if (!buttons || !buttons.length) return;
    const { animate } = motion;

    buttons.forEach((btn) => {
        if (btn.dataset.voltTap === '1') return;
        btn.dataset.voltTap = '1';

        const press = () => {
            animate(btn, { scale: 0.97 }, SPRING.tap);
        };
        const release = () => {
            animate(btn, { scale: 1 }, SPRING.tap);
        };

        btn.addEventListener('pointerdown', press);
        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointerleave', release);
        btn.addEventListener('pointercancel', release);
        btn.addEventListener('blur', release);
    });
}

/**
 * Variante de `splitWords` que recorre los `childNodes` y preserva la clase
 * de los elementos hijos (típicamente `<span class="accent">`). Cada palabra
 * queda en un `<span.volt-word>` y, si venía dentro de un elemento clasificado,
 * hereda esa clase — así "equipamiento" del manifiesto sigue siendo rojo.
 */
function splitWordsPreservingSpans(el) {
    if (!el) return [];
    if (el.dataset.voltSplit === 'words') {
        return Array.from(el.querySelectorAll('.volt-word'));
    }
    const ariaLabel = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const words = [];
    const newChildren = [];

    const pushWord = (word, extraClass) => {
        const span = document.createElement('span');
        span.className = extraClass ? `volt-word ${extraClass}` : 'volt-word';
        span.setAttribute('aria-hidden', 'true');
        span.style.display = 'inline-block';
        span.style.willChange = 'transform, opacity';
        span.textContent = word;
        newChildren.push(span);
        words.push(span);
        newChildren.push(document.createTextNode(' '));
    };

    Array.from(el.childNodes).forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = (node.textContent || '').replace(/\s+/g, ' ');
            text.split(' ').filter(Boolean).forEach((w) => pushWord(w));
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const cls = node.className || '';
            const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
            text.split(' ').filter(Boolean).forEach((w) => pushWord(w, cls));
        }
    });

    el.setAttribute('aria-label', ariaLabel);
    el.innerHTML = '';
    newChildren.forEach((n) => el.appendChild(n));
    el.dataset.voltSplit = 'words';
    return words;
}

// ============================================================
// FASE 2 — CARRITO (badge spring + offcanvas FLIP + shake en empty)
// ============================================================

/**
 * Badge del carrito: spring scale al cambiar el `textContent` o pasar de
 * `display:none` a visible. Reemplaza el `@keyframes cartBounce` por física real.
 */
export async function initCartBadge(badgeSelector = '#cartBadge') {
    if (typeof document === 'undefined') return;
    const badge = typeof badgeSelector === 'string'
        ? document.getElementById(badgeSelector.replace(/^#/, ''))
        : badgeSelector;
    if (!badge) return;
    if (badge.dataset.voltMotionInit === '1') return;
    badge.dataset.voltMotionInit = '1';

    if (prefersReducedMotion()) return;
    const motion = await loadMotion();
    if (!motion) return;
    const { animate } = motion;

    // Mata la animación CSS pre-existente para evitar conflictos con la inline transform.
    badge.style.transformOrigin = 'center';

    let lastCount = parseBadgeCount(badge);
    let lastVisible = isVisible(badge);

    const pulse = () => {
        badge.style.animation = 'none';
        animate(badge, { scale: [0.6, 1.25, 1] }, { duration: 0.4, ease: 'easeOut' });
    };

    const observer = new MutationObserver(() => {
        const visible = isVisible(badge);
        const count = parseBadgeCount(badge);
        // Pulse cuando aparece (0→visible) o cuando crece el contador.
        const justAppeared = visible && !lastVisible;
        const grew = visible && lastVisible && count > lastCount;
        if (justAppeared || grew) pulse();
        lastVisible = visible;
        lastCount = count;
    });
    observer.observe(badge, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style'],
    });
}

function parseBadgeCount(badge) {
    const txt = (badge.textContent || '').trim();
    if (!txt) return 0;
    if (txt.endsWith('+')) return parseInt(txt, 10) || 0;
    return parseInt(txt, 10) || 0;
}

function isVisible(el) {
    const style = el.style.display;
    if (style && style !== 'none') return true;
    if (style === 'none') return false;
    return getComputedStyle(el).display !== 'none';
}

/**
 * Offcanvas del carrito: FLIP layout animation cuando se agregan/eliminan items.
 *   - Cada `<li.cart-item>` lleva `data-line-key` (puesto por main.js) que identifica
 *     la línea de carrito (id + color + talle) entre renders.
 *   - Snapshot de posiciones antes de cada mutación → al haber un nuevo render
 *     con la misma key, animamos la diferencia (FLIP "First-Last-Invert-Play").
 *   - Items nuevos entran con spring (opacity + y + scale). Esto reemplaza
 *     la animación CSS `slideIn` que main.js sigue seteando como fallback.
 */
export async function initCartOffcanvas(listSelector = '#cart-items') {
    if (typeof document === 'undefined') return;
    const list = typeof listSelector === 'string'
        ? document.querySelector(listSelector)
        : listSelector;
    if (!list) return;
    if (list.dataset.voltMotionInit === '1') return;
    list.dataset.voltMotionInit = '1';

    if (prefersReducedMotion()) return;
    const motion = await loadMotion();
    if (!motion) return;
    const { animate } = motion;

    /** Map<lineKey, DOMRect> con la posición de cada `<li>` del render anterior. */
    let prevRects = snapshotRects(list);

    const observer = new MutationObserver(() => {
        const currentItems = Array.from(list.querySelectorAll('.cart-item'));
        currentItems.forEach((li) => {
            // Matamos la animación CSS que main.js setea inline (slideIn / slideOut).
            if (li.style.animation && li.style.animation !== 'none') {
                li.style.animation = 'none';
            }

            const key = li.dataset.lineKey;
            const newRect = li.getBoundingClientRect();
            const prev = key ? prevRects.get(key) : null;

            if (prev) {
                // FLIP: invertimos la diferencia y la animamos a 0.
                const dy = prev.top - newRect.top;
                if (Math.abs(dy) > 0.5) {
                    animate(li, { y: [dy, 0] }, SPRING.soft);
                }
            } else {
                // Item nuevo: entrada con spring.
                animate(
                    li,
                    { opacity: [0, 1], y: [10, 0], scale: [0.96, 1] },
                    SPRING.snappy
                );
            }
        });

        prevRects = snapshotRects(list, currentItems);
    });

    observer.observe(list, { childList: true });
}

function snapshotRects(list, items) {
    const map = new Map();
    const nodes = items || Array.from(list.querySelectorAll('.cart-item'));
    nodes.forEach((li) => {
        const key = li.dataset.lineKey;
        if (!key) return;
        map.set(key, li.getBoundingClientRect());
    });
    return map;
}

/**
 * Shake spring para feedback de "no hay items" en el carrito.
 *
 * Aplicación interna por defecto: clickeás el botón flotante `.btn-cart`
 * y el carrito está vacío → el ícono tiembla 200ms (no bloquea al offcanvas).
 *
 * Exportamos `shakeElement` para que cualquier otra parte de la app pueda
 * pedir el mismo gesto (p. ej. cuando se desbloquee el botón "Vaciar").
 */
export async function initCartEmptyShake(triggerSelector = '.btn-cart') {
    if (typeof document === 'undefined') return;
    const trigger = typeof triggerSelector === 'string'
        ? document.querySelector(triggerSelector)
        : triggerSelector;
    if (!trigger) return;
    if (trigger.dataset.voltMotionShake === '1') return;
    trigger.dataset.voltMotionShake = '1';

    if (prefersReducedMotion()) return;
    const motion = await loadMotion();
    if (!motion) return;

    trigger.addEventListener('click', () => {
        if (cartIsEmpty()) shakeElement(trigger, motion);
    }, { capture: true });
}

function cartIsEmpty() {
    try {
        const raw = localStorage.getItem('cart');
        if (!raw) return true;
        const items = JSON.parse(raw);
        if (!Array.isArray(items) || items.length === 0) return true;
        return items.every((it) => !it || !it.quantity);
    } catch {
        return true;
    }
}

/**
 * Shake reusable: 3 sacudidas horizontales con damping rápido.
 * Acepta el módulo `motion` ya cargado (evita doble import) o lo carga al vuelo.
 */
export async function shakeElement(target, motionModule) {
    if (typeof document === 'undefined') return;
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    if (prefersReducedMotion()) return;
    const motion = motionModule || (await loadMotion());
    if (!motion) return;
    motion.animate(
        el,
        { x: [0, -6, 5, -3, 2, 0] },
        { duration: 0.42, ease: 'easeInOut' }
    );
}

// ============================================================
// FASE 3 — IDENTIDAD + DROP + MANIFIESTO (entradas sutiles + scroll-link)
// ============================================================

/**
 * Helper para "destronar" un elemento del sistema `.reveal` / `.is-visible`
 * antes de que Motion tome el control: evita doble animación.
 */
function takeOverReveal(el) {
    if (!el) return;
    el.classList.remove('reveal', 'is-visible');
    // El IO inline del index.html ya no lo va a marcar — y el CSS de `.reveal`
    // tampoco se aplica más, así que las inline styles que pongamos son la verdad.
}

/**
 * Identity cards (sección "/ 001 — IDENTIDAD"):
 *   - Entrada staggered cuando el grid entra al viewport (vía `inView`).
 *   - Tilt 3D sutil en hover (rotateY/rotateX ±2deg, perspectiva 1000px) —
 *     se desactiva en touch para no robar el `:hover` CSS existente.
 */
export async function initIdentityCards(gridSelector = '.identity__grid') {
    if (typeof document === 'undefined') return;
    const grid = typeof gridSelector === 'string' ? document.querySelector(gridSelector) : gridSelector;
    if (!grid) return;
    if (grid.dataset.voltMotionInit === '1') return;
    grid.dataset.voltMotionInit = '1';

    const cards = Array.from(grid.querySelectorAll('.identity__card'));
    if (!cards.length) return;

    if (prefersReducedMotion()) return;
    const motion = await loadMotion();
    if (!motion) return;
    const { animate, stagger, inView } = motion;

    // Tomamos control del reveal y seteamos el estado inicial.
    cards.forEach((card) => {
        takeOverReveal(card);
        card.style.opacity = '0';
        card.style.transform = 'translateY(18px)';
        card.style.willChange = 'transform, opacity';
    });

    // Perspectiva en el grid para que el tilt se vea como 3D real.
    grid.style.perspective = '1000px';

    inView(grid, () => {
        animate(
            cards,
            { opacity: [0, 1], y: [18, 0] },
            { delay: stagger(0.12), ...SPRING.soft }
        );
    }, { amount: 0.2 });

    enhanceIdentityTilt(cards, motion);
}

function enhanceIdentityTilt(cards, motion) {
    if (!cards.length) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (!fine.matches) return;
    const { animate } = motion;
    const MAX_DEG = 2;

    cards.forEach((card) => {
        if (card.dataset.voltTilt === '1') return;
        card.dataset.voltTilt = '1';

        const onMove = (e) => {
            const rect = card.getBoundingClientRect();
            const relX = (e.clientX - rect.left) / rect.width - 0.5;
            const relY = (e.clientY - rect.top) / rect.height - 0.5;
            animate(
                card,
                { rotateY: relX * MAX_DEG * 2, rotateX: -relY * MAX_DEG * 2 },
                SPRING.soft
            );
        };
        const onLeave = () => {
            animate(card, { rotateY: 0, rotateX: 0 }, SPRING.snappy);
        };

        card.addEventListener('mousemove', onMove);
        card.addEventListener('mouseleave', onLeave);
    });
}

/**
 * Parallax sutil sobre `.drop__visual img`: cuando la sección entra y sale del
 * viewport, la imagen se desplaza linealmente entre +offset y −offset px.
 *
 * Reemplaza la idea de un `scroll listener` manual — usa `ScrollTimeline` API
 * en browsers que la soporten (hardware-accelerated) y cae a rAF en el resto.
 */
export async function initDropParallax(sectionSelector = '.drop') {
    if (typeof document === 'undefined') return;
    const section = typeof sectionSelector === 'string'
        ? document.querySelector(sectionSelector)
        : sectionSelector;
    if (!section) return;
    if (section.dataset.voltMotionInit === '1') return;
    section.dataset.voltMotionInit = '1';

    const img = section.querySelector('.drop__visual img');
    if (!img) return;

    if (prefersReducedMotion()) return;
    const motion = await loadMotion();
    if (!motion) return;
    const { animate, scroll } = motion;

    img.style.willChange = 'transform';

    const animation = animate(
        img,
        { y: [30, -30] },
        { ease: 'linear' }
    );
    scroll(animation, {
        target: section,
        offset: ['start end', 'end start'],
    });
}

/**
 * Manifiesto: word-by-word reveal del quote.
 *   - Split del `<h2.manifesto__quote>` por palabras preservando los
 *     `<span class="accent">` (las palabras heredan la clase y quedan rojas).
 *   - Stagger fade-up cuando el quote entra al viewport.
 */
export async function initManifestoReveal(quoteSelector = '.manifesto__quote') {
    if (typeof document === 'undefined') return;
    const quote = typeof quoteSelector === 'string'
        ? document.querySelector(quoteSelector)
        : quoteSelector;
    if (!quote) return;
    if (quote.dataset.voltMotionInit === '1') return;
    quote.dataset.voltMotionInit = '1';

    if (prefersReducedMotion()) return;
    const motion = await loadMotion();
    if (!motion) return;
    const { animate, stagger, inView } = motion;

    takeOverReveal(quote);
    // Reset por si el reveal CSS llegó a setear opacity:0 con su transition.
    quote.style.opacity = '1';
    quote.style.transform = 'none';

    const words = splitWordsPreservingSpans(quote);
    if (!words.length) return;

    words.forEach((w) => {
        w.style.opacity = '0';
        w.style.transform = 'translateY(0.35em)';
    });

    inView(quote, () => {
        animate(
            words,
            { opacity: [0, 1], y: ['0.35em', '0em'] },
            { delay: stagger(0.035), ...SPRING.soft }
        );
    }, { amount: 0.3 });
}

// ============================================================
// FASE 4 — CATÁLOGO (grid stagger + tap feedback en CTAs internos)
// ============================================================

/**
 * Anima un set de `.product-card` con stagger desde el centro.
 *   - Mata SINCRÓNICAMENTE el `style.animation = fadeInUp ...` legacy que
 *     `catalog.js` setea inline al crear cada card (se ejecuta dentro del
 *     callback del MutationObserver, antes del próximo paint → sin flash).
 *   - Usa spring snappy: la entrada se siente "física" y rápida.
 *   - Engancha tap feedback en los CTAs internos de cada card (add-to-cart,
 *     product-finalize-btn) — el rest queda en manos del CSS hover de la DS.
 */
function animateCardsEntry(cards, motion) {
    if (!cards.length) return;
    const { animate, stagger } = motion;

    cards.forEach((card) => {
        if (card.dataset.voltCardAnimated === '1') return;
        card.dataset.voltCardAnimated = '1';
        // Pisamos el `fadeInUp` legacy y seteamos el estado inicial antes del paint.
        card.style.animation = 'none';
        card.style.opacity = '0';
        card.style.transform = 'translateY(14px) scale(0.96)';
        card.style.willChange = 'transform, opacity';
    });

    animate(
        cards,
        { opacity: [0, 1], y: [14, 0], scale: [0.96, 1] },
        { delay: stagger(0.04, { from: 'center' }), ...SPRING.snappy }
    );

    // Tap feedback en los CTAs internos. `enhanceTapButtons` es idempotente.
    cards.forEach((card) => {
        const ctas = Array.from(card.querySelectorAll('.add-to-cart, .product-finalize-btn'));
        if (ctas.length) enhanceTapButtons(ctas, motion);
    });
}

/**
 * Apaga la animación CSS legacy de un set de cards sin reemplazarla.
 * Usado en reduced-motion: el usuario pidió silencio visual.
 */
function silenceCardsEntry(cards) {
    cards.forEach((card) => {
        if (card.dataset.voltCardAnimated === '1') return;
        card.dataset.voltCardAnimated = '1';
        card.style.animation = 'none';
        card.style.opacity = '';
        card.style.transform = '';
    });
}

/**
 * Grid de productos del catálogo:
 *   - Carga inicial: anima las cards existentes con stagger desde el centro.
 *   - Re-renders (cambio de filtro): MutationObserver detecta los `appendChild`
 *     que hace `catalog.js` después de `removeAll + loadProducts` y anima el
 *     batch nuevo. Idempotente vía `data-volt-card-animated` por card.
 *   - Fallback: si Motion no carga, NO tocamos las cards → el `fadeInUp`
 *     inline de catalog.js sigue funcionando como respaldo.
 */
export async function initProductGrid(gridSelector = '.product-grid') {
    if (typeof document === 'undefined') return;
    const grid = typeof gridSelector === 'string' ? document.querySelector(gridSelector) : gridSelector;
    if (!grid) return;
    if (grid.dataset.voltMotionInit === '1') return;
    grid.dataset.voltMotionInit = '1';

    const collectCards = (root) => Array.from(root.querySelectorAll('.product-card'));
    const collectAddedCards = (mutations) => {
        const added = [];
        mutations.forEach((m) => {
            m.addedNodes.forEach((n) => {
                if (n.nodeType !== 1) return;
                if (n.classList && n.classList.contains('product-card')) added.push(n);
            });
        });
        return added;
    };

    if (prefersReducedMotion()) {
        silenceCardsEntry(collectCards(grid));
        const observer = new MutationObserver((mutations) => {
            const added = collectAddedCards(mutations);
            if (added.length) silenceCardsEntry(added);
        });
        observer.observe(grid, { childList: true });
        return;
    }

    const motion = await loadMotion();
    if (!motion) return; // CDN caído → fallback CSS legacy (fadeInUp) actúa.

    // Cards que ya estaban en el DOM cuando arrancamos (caso typical: la carga
    // inicial del catálogo termina antes de que loadMotion() resuelva).
    animateCardsEntry(collectCards(grid), motion);

    const observer = new MutationObserver((mutations) => {
        const added = collectAddedCards(mutations);
        if (added.length) animateCardsEntry(added, motion);
    });
    observer.observe(grid, { childList: true });
}

// ============================================================
// FASE 5 — PAGE TRANSITIONS (exit anim → location.href)
// ============================================================

/**
 * Intercepta clicks en `a[href]` internos y reproduce una salida de página
 * con Motion antes de navegar. Reemplaza el `setTimeout(230)` que tenían
 * `index.html` inline y el IIFE de `js/animations.js`.
 *
 * Comportamiento:
 *   - Target = `.page-shell` (home) o `<body>` (resto de las páginas).
 *   - Motion se carga LAZY al primer click → la página no paga el costo del
 *     CDN si el usuario nunca navega.
 *   - Reduced-motion → navegación instantánea (sin flash).
 *   - Si Motion no carga (CDN caído) → fallback CSS legacy: agrega
 *     `.page-leaving` y `setTimeout(230)`. Mismo comportamiento que el código
 *     que reemplazamos.
 *   - Idempotente vía `data-volt-page-tr` sobre `<html>`.
 */
export async function initPageTransitions() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (root.dataset.voltPageTr === '1') return;
    root.dataset.voltPageTr = '1';

    const FALLBACK_MS = 230;

    const isInternalNav = (link) => {
        const href = link.getAttribute('href');
        if (!href) return false;
        if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
        if (link.target === '_blank') return false;
        if (link.hasAttribute('download')) return false;
        if (link.hasAttribute('data-bs-toggle') || link.hasAttribute('data-bs-dismiss')) return false;
        // WhatsApp y similares: dejar pasar nativo (es navegación a app externa).
        if (/^https?:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(href)) return false;
        try {
            const dest = new URL(href, location.href);
            if (dest.origin !== location.origin) return false;
            if (dest.pathname === location.pathname && dest.search === location.search) return false;
        } catch {
            return false;
        }
        return true;
    };

    const getTarget = () => document.querySelector('.page-shell') || document.body;

    // Lazy: solo cargamos Motion cuando realmente intentás navegar.
    let lazyMotionPromise = null;
    const lazyMotion = () => {
        if (!lazyMotionPromise) lazyMotionPromise = loadMotion();
        return lazyMotionPromise;
    };

    document.addEventListener('click', async (e) => {
        // Solo botón izquierdo, sin modificadores (preservar ctrl/cmd+click).
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const link = e.target.closest('a[href]');
        if (!link || !isInternalNav(link)) return;

        e.preventDefault();
        const href = link.getAttribute('href');

        if (prefersReducedMotion()) {
            location.href = href;
            return;
        }

        const motion = await lazyMotion();
        const target = getTarget();

        if (!motion) {
            // CDN caído → fallback al comportamiento original.
            if (target) target.classList.add('page-leaving');
            setTimeout(() => { location.href = href; }, FALLBACK_MS);
            return;
        }

        try {
            await motion.animate(
                target,
                { opacity: [1, 0], y: [0, -8] },
                { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
            ).finished;
        } catch {
            // Si la animación es interrumpida, navegamos igual.
        }
        location.href = href;
    });
}

// ============================================================
// Auto-init opcional: si la página marca `<body data-volt-motion="auto">`
// arrancamos el hero solo. Caso contrario, cada página importa lo que necesita.
// ============================================================

if (typeof document !== 'undefined') {
    const boot = () => {
        if (document.body && document.body.dataset.voltMotion === 'auto') {
            initHeroEntrance();
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
}

export const __voltMotionInternals = {
    toElements,
    SPRING,
    splitWords,
    splitWordsPreservingSpans,
};
