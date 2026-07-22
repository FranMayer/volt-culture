"use client";

import { useLayoutEffect } from "react";
import { prefersReducedMotion } from "./prefersReducedMotion";

/**
 * lib/motion/useHeroEntrance.ts — adaptation of legacy/js/volt-motion.js's
 * `initHeroEntrance()` headline split (lines 109-204, `splitWordsPreservingSpans`
 * at 350-387) + `enhanceMagneticButtons`/`enhanceTapButtons` (285-342).
 * Motion.dev's spring `animate()` is replaced by native APIs per CLAUDE.md
 * (no jsdelivr/motion.dev): headline words use `element.animate()` (WAAPI)
 * with a back-out easing curve approximating the original overshoot spring;
 * magnetic/tap use plain `style.transform` + a CSS transition, tracking one
 * {x,y,scale} state per button so the two gestures compose into a single
 * `transform` string instead of clobbering each other (Motion's springs
 * compose transform components internally; raw WAAPI/inline style doesn't).
 * Word-splitting logic (incl. `.accent` span preservation) and magnetic
 * max-offset/tap scale values are a literal port.
 *
 * Scope (per task): headline split-word entrance + magnetic hover + tap
 * feedback on `.hero__ctas .btn` only. Badge pulse (already a plain CSS
 * `pulse-red` keyframe, ported in home.css — no JS needed) and the sub/badge
 * fade-in from the legacy function are out of this task's scope.
 *
 * Hydration-safe: the split only ever touches `.hero__headline`'s DOM inside
 * this client effect, after the server-rendered markup has already mounted
 * and hydrated untouched — never diverges SSR vs. client output.
 *
 * StrictMode-safe (useLightsOut's pattern, see that file's header comment
 * for the full reasoning): `useLayoutEffect` hides the split words
 * synchronously (before paint), so StrictMode's dev-only
 * setup->cleanup->setup double-invoke hides/restores/hides again without
 * ever painting an intermediate frame. The actual WAAPI `.animate()` calls
 * are deferred one macrotask via `setTimeout(fn, 0)` ("kickoff"); the
 * throwaway first pass's cleanup runs synchronously and clears that timer
 * before it fires, so only the surviving second pass actually animates.
 * Cleanup unconditionally restores `opacity`/`transform` to "" (== visible,
 * static) regardless of whether the animation ran — the headline can never
 * end up permanently stuck at opacity 0.
 */
const MAGNETIC_MAX = 6; // px, legacy `MAX`
const HEADLINE_STAGGER_MS = 60; // legacy `stagger(0.06, ...)`
const HEADLINE_START_DELAY_MS = 100; // legacy `startDelay: 0.1`
const HEADLINE_DURATION_MS = 420;
// ponytail: single cubic-bezier "back out" curve standing in for Motion's
// physical spring (stiffness 380/damping 18) — same overshoot-then-settle
// feel, not a literal physics port.
const HEADLINE_EASING = "cubic-bezier(0.34, 1.56, 0.64, 1)";
const BUTTON_TRANSITION = "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";

function splitWordsPreservingSpans(el: HTMLElement): HTMLElement[] {
  if (el.dataset.voltSplit === "words") {
    return Array.from(el.querySelectorAll<HTMLElement>(".volt-word"));
  }
  const ariaLabel = (el.textContent || "").replace(/\s+/g, " ").trim();
  const words: HTMLElement[] = [];
  const newChildren: Node[] = [];

  const pushWord = (word: string, extraClass?: string) => {
    const span = document.createElement("span");
    span.className = extraClass ? `volt-word ${extraClass}` : "volt-word";
    span.setAttribute("aria-hidden", "true");
    span.style.display = "inline-block";
    span.style.willChange = "transform, opacity";
    span.textContent = word;
    newChildren.push(span);
    words.push(span);
    newChildren.push(document.createTextNode(" "));
  };

  Array.from(el.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      (node.textContent || "")
        .replace(/\s+/g, " ")
        .split(" ")
        .filter(Boolean)
        .forEach((w) => pushWord(w));
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const cls = (node as HTMLElement).className || "";
      (node.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .split(" ")
        .filter(Boolean)
        .forEach((w) => pushWord(w, cls));
    }
  });

  el.setAttribute("aria-label", ariaLabel);
  el.innerHTML = "";
  newChildren.forEach((n) => el.appendChild(n));
  el.dataset.voltSplit = "words";
  return words;
}

/** Magnetic hover (fine pointer only) + tap press feedback on `.hero__ctas .btn`. */
function wireButtons(buttons: HTMLElement[]): Array<() => void> {
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  return buttons.map((btn) => {
    const state = { x: 0, y: 0, scale: 1 };
    btn.style.transition = BUTTON_TRANSITION;
    const apply = () => {
      btn.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    };

    let onMove: ((e: MouseEvent) => void) | null = null;
    let onMagneticLeave: (() => void) | null = null;
    if (fine) {
      onMove = (e: MouseEvent) => {
        const rect = btn.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width - 0.5;
        const relY = (e.clientY - rect.top) / rect.height - 0.5;
        state.x = relX * MAGNETIC_MAX * 2;
        state.y = relY * MAGNETIC_MAX * 2;
        apply();
      };
      onMagneticLeave = () => {
        state.x = 0;
        state.y = 0;
        apply();
      };
      btn.addEventListener("mousemove", onMove);
      btn.addEventListener("mouseleave", onMagneticLeave);
    }

    const press = () => {
      state.scale = 0.97;
      apply();
    };
    const release = () => {
      state.scale = 1;
      apply();
    };
    btn.addEventListener("pointerdown", press);
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointerleave", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("blur", release);

    return () => {
      if (onMove) btn.removeEventListener("mousemove", onMove);
      if (onMagneticLeave) btn.removeEventListener("mouseleave", onMagneticLeave);
      btn.removeEventListener("pointerdown", press);
      btn.removeEventListener("pointerup", release);
      btn.removeEventListener("pointerleave", release);
      btn.removeEventListener("pointercancel", release);
      btn.removeEventListener("blur", release);
      btn.style.transform = "";
      btn.style.transition = "";
    };
  });
}

export function useHeroEntrance(rootSelector = ".hero") {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>(rootSelector);
    if (!root) return;
    if (prefersReducedMotion()) return; // static: content already renders visible from CSS

    const headline = root.querySelector<HTMLElement>(".hero__headline");
    const ctas = Array.from(root.querySelectorAll<HTMLElement>(".hero__ctas .btn"));
    const buttonCleanups = wireButtons(ctas);

    const words = headline ? splitWordsPreservingSpans(headline) : [];
    words.forEach((w) => {
      w.style.opacity = "0";
      w.style.transform = "translateY(0.5em)";
    });

    const animations: Animation[] = [];
    const kickoff = window.setTimeout(() => {
      words.forEach((w, i) => {
        animations.push(
          w.animate(
            [
              { opacity: 0, transform: "translateY(0.5em)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            {
              duration: HEADLINE_DURATION_MS,
              delay: HEADLINE_START_DELAY_MS + i * HEADLINE_STAGGER_MS,
              easing: HEADLINE_EASING,
              fill: "forwards",
            }
          )
        );
      });
    }, 0);

    return () => {
      clearTimeout(kickoff);
      animations.forEach((a) => a.cancel());
      words.forEach((w) => {
        w.style.opacity = "";
        w.style.transform = "";
      });
      buttonCleanups.forEach((fn) => fn());
    };
  }, [rootSelector]);
}
