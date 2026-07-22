"use client";

import { useReveal } from "@/lib/motion/useReveal";

/**
 * components/RevealOnScroll.tsx — F8 fix for CRÍTICO-1.
 *
 * about/envios/novedades are server components with `.reveal`/`.reveal-left`/
 * `.reveal-right` markup but no client motion wiring (unlike home, which has
 * HomeMotion). style.css/volt-ds.css hide those classes globally
 * (`opacity:0!important`) and only un-hide them via `.active` — previously
 * added by legacy/js/animations.js, which is explicitly NOT migrated (dead
 * code per CLAUDE.md). Without this, the content stayed invisible forever.
 *
 * Mount this as a child of the page's <main>; it renders nothing and just
 * observes `#main-content` via useReveal's IntersectionObserver, toggling
 * `.active` (the CSS's own un-scoped counterpart class — not home's
 * `.is-visible`, which only has a `.home-page`-scoped visible rule).
 */
export default function RevealOnScroll() {
  useReveal("#main-content", "active");
  return null;
}
