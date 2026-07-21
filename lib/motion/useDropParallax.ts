"use client";

import { useEffect } from "react";
import { prefersReducedMotion } from "./prefersReducedMotion";

/**
 * lib/motion/useDropParallax.ts — adaptation of legacy/js/volt-motion.js
 * `initDropParallax()` (lines 678-706). Legacy used Motion.dev's
 * `scroll()` timeline (ScrollTimeline-backed where supported) to drive
 * `.drop__visual img` linearly between y:30 and y:-30 across the section's
 * viewport traversal. Same visual result here via a plain scroll listener
 * throttled to one `requestAnimationFrame` per frame + the same linear
 * mapping, no external animation library (CLAUDE.md: no new deps).
 */
const RANGE = 30; // px — legacy `{ y: [30, -30] }`

export function useDropParallax(sectionSelector = ".drop") {
  useEffect(() => {
    if (prefersReducedMotion()) return;

    const section = document.querySelector<HTMLElement>(sectionSelector);
    const img = section?.querySelector<HTMLElement>(".drop__visual img");
    if (!section || !img) return;

    let rafId: number | null = null;

    const update = () => {
      rafId = null;
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the section's top just enters the viewport bottom, 1 when its
      // bottom leaves the viewport top — same "start end" -> "end start"
      // offsets Motion's scroll() used.
      const total = rect.height + vh;
      const progress = total > 0 ? Math.min(1, Math.max(0, (vh - rect.top) / total)) : 0;
      const y = RANGE - progress * RANGE * 2;
      img.style.transform = `translateY(${y.toFixed(2)}px)`;
    };

    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
      img.style.transform = "";
    };
  }, [sectionSelector]);
}
