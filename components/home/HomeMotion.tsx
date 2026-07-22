"use client";

import { useLightsOut } from "@/lib/motion/useLightsOut";
import { useReveal } from "@/lib/motion/useReveal";
import { useDropParallax } from "@/lib/motion/useDropParallax";
import { usePageFadeOut } from "@/lib/motion/usePageFadeOut";
import { useHeroEntrance } from "@/lib/motion/useHeroEntrance";
import { useIdentityTilt } from "@/lib/motion/useIdentityTilt";

// F6 Tarea 2 — client-only wiring for the volt-motion adaptation. app/page.tsx
// stays a server component with the full markup already in the DOM; this
// component renders nothing and only "realza" it from effects that target
// the existing DOM by class/id (see each hook's own header comment for the
// legacy volt-motion.js function it adapts).
// F6 flourish pass — useHeroEntrance/useIdentityTilt add the headline
// split-word entrance, magnetic/tap buttons, and identity card tilt that
// were left out of Tarea 2.
export default function HomeMotion() {
  useLightsOut();
  useReveal();
  useDropParallax();
  usePageFadeOut();
  useHeroEntrance();
  useIdentityTilt();
  return null;
}
