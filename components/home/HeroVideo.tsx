"use client";

import { useEffect, useState } from "react";

/**
 * Atmospheric background loop for the hero (8s, seamless — first frame == last,
 * so the native `loop` wrap is invisible). Source composition lives outside this
 * repo in ../volt-hero-loop (HyperFrames); only the encoded MP4 ships here.
 *
 * The poster is a CSS background on the wrapper rather than the <video poster>
 * attribute on purpose: it paints for every visitor (including the ones who
 * never get the <video> at all) and doubles as the first paint while the file
 * buffers. Since it IS frame 0 of the loop, the handoff to video is seamless.
 */
export default function HeroVideo() {
  const [playable, setPlayable] = useState(false);

  useEffect(() => {
    // Mobile never pays the 742 KB download — it keeps the poster only. Same
    // for anyone who asked for reduced motion. Deliberately not a CSS media
    // query: `display:none` does not reliably prevent the fetch.
    const wideEnough = window.matchMedia("(min-width: 769px)").matches;
    const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPlayable(wideEnough && motionOk);
  }, []);

  return (
    <div className="hero__bg" aria-hidden="true">
      {playable && (
        <video
          className="hero__bg-video"
          src="/video/hero-loop.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
      )}
    </div>
  );
}
