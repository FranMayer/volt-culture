"use client";

import { useEffect } from "react";
import { prefersReducedMotion } from "./prefersReducedMotion";

/**
 * lib/motion/useIdentityTilt.ts — adaptation of legacy/js/volt-motion.js's
 * `enhanceIdentityTilt()` (part of `initIdentityCards`, lines 641-669): a
 * subtle 3D tilt on `.identity__card` that follows the cursor, fine-pointer
 * only (matches legacy's `(hover: hover) and (pointer: fine)` gate). Values
 * (MAX_DEG=2, perspective 1000px) are a literal port; Motion's spring
 * `animate()` is replaced by a native CSS transition per CLAUDE.md.
 *
 * `.identity__card` carries the `.reveal` class (app/page.tsx) whose
 * `.reveal`/`.reveal.is-visible` rules (volt-ds.css / home.css, wired by
 * `useReveal` from F6 Tarea 2 — NOT touched here) set `transform` AND
 * `transition` with `!important`. A plain inline `style.transform` can
 * never beat a stylesheet `!important` rule, so both properties are set via
 * `setProperty(..., "important")` here — same importance bucket as the
 * reveal rule, and inline wins the specificity tie-break within it. This
 * only matters once a card is already visible (opacity 1, `is-visible`
 * added) — hover can't happen on an off-screen card, so no interaction with
 * the reveal entrance's own opacity transition timing.
 */
const MAX_DEG = 2;
const TILT_TRANSITION = "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)";

export function useIdentityTilt(gridSelector = ".identity__grid") {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const grid = document.querySelector<HTMLElement>(gridSelector);
    if (!grid) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const cards = Array.from(grid.querySelectorAll<HTMLElement>(".identity__card"));
    if (!cards.length) return;

    grid.style.perspective = "1000px";

    const cleanups = cards.map((card) => {
      card.style.setProperty("transition", TILT_TRANSITION, "important");

      const onMove = (e: MouseEvent) => {
        const rect = card.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width - 0.5;
        const relY = (e.clientY - rect.top) / rect.height - 0.5;
        const rotateY = (relX * MAX_DEG * 2).toFixed(2);
        const rotateX = (-relY * MAX_DEG * 2).toFixed(2);
        card.style.setProperty(
          "transform",
          `translateY(0) rotateY(${rotateY}deg) rotateX(${rotateX}deg)`,
          "important"
        );
      };
      const onLeave = () => {
        card.style.setProperty("transform", "translateY(0)", "important");
      };

      card.addEventListener("mousemove", onMove);
      card.addEventListener("mouseleave", onLeave);

      return () => {
        card.removeEventListener("mousemove", onMove);
        card.removeEventListener("mouseleave", onLeave);
        card.style.removeProperty("transform");
        card.style.removeProperty("transition");
      };
    });

    return () => {
      cleanups.forEach((fn) => fn());
      grid.style.perspective = "";
    };
  }, [gridSelector]);
}
