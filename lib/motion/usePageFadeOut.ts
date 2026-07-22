"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { prefersReducedMotion } from "./prefersReducedMotion";

/**
 * lib/motion/usePageFadeOut.ts — degraded adaptation of legacy/js/
 * volt-motion.js `initPageTransitions()` (lines 875-946). Per task scope
 * ("degradá a fade simple... NO metas un sistema de transición de router
 * complejo"): reuses the `.page-leaving` CSS that's already ported inert in
 * home.css/volt-ds.css (opacity+translateY transition, 220-230ms) and just
 * toggles it before navigating away, same `isInternalNav` filter as legacy
 * (skip hash/mailto/tel/_blank/download/whatsapp/external/same-URL links,
 * respect modifier-clicks) and the same 230ms fallback delay — but routes
 * through Next's `router.push` instead of `location.href` (this is an SPA
 * now, a full reload would be a regression vs. the rest of the migration).
 *
 * Scoped to clicks that bubble through `rootSelector` (`.home-page`) only,
 * not `document` globally like legacy: the shared Navbar/Footer links and
 * every other route are out of scope for this task ("no tocar catálogo/
 * producto/pagos/auth/checkout") — this only affects links a user clicks
 * from within the home page's own content (drop/manifesto CTAs, etc.).
 *
 * Skipped: entrance replay of `volt-page-in` on SPA navigation (the layout
 * `<body>` doesn't remount between routes, so the fade-in from volt-ds.css
 * only plays on a hard load) — exit-only is what "fade simple" asks for;
 * add a route-change entrance replay later if it's actually missed.
 */
const FALLBACK_MS = 230;

function isInternalNav(link: HTMLAnchorElement): boolean {
  const href = link.getAttribute("href");
  if (!href) return false;
  if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  if (link.target === "_blank") return false;
  if (link.hasAttribute("download")) return false;
  if (/^https?:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(href)) return false;
  try {
    const dest = new URL(href, window.location.href);
    if (dest.origin !== window.location.origin) return false;
    if (dest.pathname === window.location.pathname && dest.search === window.location.search) return false;
  } catch {
    return false;
  }
  return true;
}

export function usePageFadeOut(rootSelector = ".home-page") {
  const router = useRouter();

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(rootSelector);
    if (!root) return;

    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!link || !isInternalNav(link)) return;

      e.preventDefault();
      const href = link.getAttribute("href")!;

      if (prefersReducedMotion()) {
        router.push(href);
        return;
      }

      const shell = document.querySelector(".page-shell");
      shell?.classList.add("page-leaving");
      window.setTimeout(() => router.push(href), FALLBACK_MS);
    };

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [rootSelector, router]);
}
