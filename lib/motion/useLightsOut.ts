"use client";

import { useLayoutEffect } from "react";
import { prefersReducedMotion } from "./prefersReducedMotion";

/**
 * lib/motion/useLightsOut.ts — adaptation of legacy/js/volt-motion.js
 * `initLightsOut()` (lines 217-256). Timing/classList sequence is a literal
 * transcription (no Motion.dev dependency in the original either — it's
 * plain setTimeout + classList toggles); only the wrapper changed (effect +
 * cleanup instead of a page-load IIFE).
 *
 * "Solo primera carga de sesión" guard: identical sessionStorage key/value
 * as legacy (`voltLightsOut` = '1'). A reload within the same tab session
 * finds the key set and removes the overlay immediately, no sequence runs.
 * New tab / after closing the browser → sessionStorage is gone → runs again
 * (same behavior as production today).
 *
 * StrictMode note (dev only): React double-invokes effects synchronously on
 * mount (setup -> cleanup -> setup, all within the same tick, before any
 * timer fires). The `seen`/reduced-motion branch just calls `overlay.remove()`
 * and is naturally idempotent under that (2nd setup finds no overlay via
 * `getElementById` and bails via the guard above) — no special handling
 * needed, and it runs in `useLayoutEffect` so removal happens before paint
 * (no black-frame flash on client-side nav back to "/").
 * The timed sequence branch is NOT naturally idempotent: it writes
 * sessionStorage and schedules timers, and the throwaway first setup's
 * cleanup would cancel those timers — leaving the overlay's fallback CSS
 * killed (`is-running`) with nothing left to remove it. Fix: defer the
 * side-effecting part (`kickoff`) by one macrotask via `setTimeout(fn, 0)`.
 * StrictMode's cleanup runs synchronously right after setup, in the same
 * tick, so it cancels the throwaway kickoff before it ever fires; only the
 * surviving second setup's kickoff actually executes. In production
 * (single setup, no StrictMode) this just delays the sequence start by
 * one tick — imperceptible for an intro that already starts at START=300ms.
 */
const SESSION_KEY = "voltLightsOut";
const STEP = 500;
const START = 300;
const HOLD_MIN = 500;
const HOLD_RANGE = 1100;

export function useLightsOut(overlayId = "voltLightsOut") {
  useLayoutEffect(() => {
    const overlay = document.getElementById(overlayId);
    if (!overlay) return;

    let seen = false;
    try {
      seen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      /* modo privado */
    }

    if (seen || prefersReducedMotion()) {
      overlay.remove();
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];

    const kickoff = setTimeout(() => {
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* modo privado */
      }

      overlay.classList.add("is-running"); // cancela el fallback CSS de 5s (home.css)
      const panel = overlay.querySelector(".lights-out__panel");
      const columns = Array.from(overlay.querySelectorAll(".lights-out__col"));

      columns.forEach((column, i) => {
        timers.push(
          setTimeout(() => {
            column.querySelectorAll(".lights-out__light--red").forEach((light) => light.classList.add("is-on"));
            panel?.classList.add("is-lit");
          }, START + i * STEP)
        );
      });

      const hold = HOLD_MIN + Math.random() * HOLD_RANGE;
      timers.push(
        setTimeout(() => {
          overlay.querySelectorAll(".lights-out__light--red").forEach((light) => light.classList.remove("is-on"));
          panel?.classList.remove("is-lit");
          overlay.classList.add("is-out");
          timers.push(setTimeout(() => overlay.remove(), 600));
        }, START + columns.length * STEP + hold)
      );
    }, 0);

    // Real unmount here means the whole `.home-page` tree is being torn
    // down by the router anyway, so canceling pending timers (or the
    // not-yet-fired kickoff, for the StrictMode throwaway pass) is enough —
    // nothing left to leave lit.
    return () => {
      clearTimeout(kickoff);
      timers.forEach(clearTimeout);
    };
  }, [overlayId]);
}
