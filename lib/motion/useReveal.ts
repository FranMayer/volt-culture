"use client";

import { useEffect } from "react";
import { prefersReducedMotion } from "./prefersReducedMotion";

/**
 * lib/motion/useReveal.ts — adaptation of legacy/index.html's own inline
 * reveal-on-scroll IIFE (legacy/index.html lines 1653-1671; NOT the
 * Motion.dev-powered `initIdentityCards`/`initManifestoReveal` variants of
 * volt-motion.js, which are a springier enhancement layered on the same
 * `.reveal` elements and out of scope here — see task notes). Same
 * IntersectionObserver options (rootMargin/threshold) and same toggle class
 * (`is-visible`, observe-once via `unobserve`).
 *
 * volt-ds.css ports `.reveal{opacity:0!important}` globally but only
 * defines the visible counterpart as `.reveal.active` (matches
 * legacy/js/animations.js, which is NOT migrated — dead code per
 * CLAUDE.md). Home's own toggle class is `is-visible`, so home.css adds a
 * `.home-page .reveal.is-visible` rule (3 classes of specificity, beats the
 * 1-class `!important` base rule regardless of source order) — see home.css.
 */
export function useReveal(rootSelector = ".home-page") {
  useEffect(() => {
    const root = document.querySelector(rootSelector);
    if (!root) return;

    const nodes = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
    if (!nodes.length) return;

    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
      nodes.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    nodes.forEach((el) => io.observe(el));

    return () => io.disconnect();
  }, [rootSelector]);
}
