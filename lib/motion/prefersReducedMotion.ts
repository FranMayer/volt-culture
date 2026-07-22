/**
 * lib/motion/prefersReducedMotion.ts — port of legacy/js/volt-motion.js's
 * `prefersReducedMotion()` (lines 19-24). Every hook in lib/motion/ gates
 * on this before touching the DOM.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
