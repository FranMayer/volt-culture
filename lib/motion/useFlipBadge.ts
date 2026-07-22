"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useCartStore, cartCount } from "@/lib/cart/store";
import { prefersReducedMotion } from "./prefersReducedMotion";

/**
 * lib/motion/useFlipBadge.ts — adaptation of legacy/js/volt-motion.js
 * `initCartBadge()` (lines 397-439). Legacy watched the badge's DOM via
 * MutationObserver because it was rendered by imperative vanilla JS
 * (main.js). Here the badge is React-driven (Navbar.tsx reads `cartCount`
 * from the store directly), so there's no DOM to observe — this hook
 * subscribes to `useCartStore` instead and plays the same scale pulse
 * (native Web Animations API — no Motion.dev spring, but same feel: quick
 * overshoot then settle) whenever the count goes up. `prefersReducedMotion`
 * mirrors legacy's early-return.
 *
 * Idempotency: `useCartStore.subscribe` is called once per effect run and
 * its `unsubscribe` is the cleanup — React's StrictMode setup->cleanup->
 * setup pairs off cleanly for the same reason documented in
 * lib/cart/sync.ts `startCartSync()` (subscribe/unsubscribe carries no
 * shared module state, so a duplicated effect can't double-fire). Two tabs
 * don't interfere either: each tab has its own React tree and its own
 * Navbar mount, so each has exactly one subscription to its own in-memory
 * store instance.
 *
 * No pulse on initial hydration: the store has `skipHydration:true`
 * (lib/cart/store.ts) — a persisted cart only loads into memory when
 * AuthProvider's effect calls `useCartStore.persist.rehydrate()`. Navbar is
 * a *child* of AuthProvider, so this hook's effect (and its `subscribe`
 * call) runs before that rehydrate — `getState().items` is still `[]` at
 * mount, so `lastCount` would start at 0 even with a saved cart, and the
 * later rehydrate's internal `set()` would look like a real add (0 -> N) and
 * fire a spurious pulse. Fix: zustand's persist middleware calls `set()`
 * (notifying subscribers) *before* flipping `hasHydrated` to true (see
 * node_modules/zustand/esm/middleware.mjs `hydrate()`) — so checking
 * `persist.hasHydrated()` *inside* the subscribe callback tells apart "this
 * notification is the hydration load" from "this is a genuine addItem"
 * without needing to guess effect ordering.
 */
export function useFlipBadge(elRef: RefObject<HTMLElement | null>) {
  const lastCount = useRef<number | null>(null);

  useEffect(() => {
    lastCount.current = cartCount(useCartStore.getState().items);

    if (prefersReducedMotion()) return;

    const pulse = () => {
      const el = elRef.current;
      if (!el) return;
      el.animate(
        [{ transform: "scale(0.6)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }],
        { duration: 400, easing: "ease-out" }
      );
    };

    const unsubscribe = useCartStore.subscribe((state) => {
      const count = cartCount(state.items);
      const isHydrationLoad = !useCartStore.persist.hasHydrated();
      if (!isHydrationLoad && lastCount.current !== null && count > lastCount.current) {
        pulse();
      }
      lastCount.current = count;
    });

    return unsubscribe;
  }, [elRef]);
}
