"use client";

import { useEffect, useState } from "react";
import { cn } from "@/utils/cn";
import type { LandingVideoSources } from "@/utils/promo/landing-video-resolver";

/**
 * Muted hero video overlaid on the promo landing image. Plays through **once**
 * (no loop) and holds on its last frame. The image beneath stays the LCP element
 * / poster; this fades in once playback starts, and degrades to that image if the
 * clip can't load. The caller is responsible for gating (reduced-motion /
 * Save-Data / viewport) — this component assumes it should play once mounted.
 */
export default function LandingHeroVideo({
  sources,
  poster,
  className,
}: {
  sources: LandingVideoSources;
  poster: string;
  className?: string;
}) {
  const [ready, setReady] = useState(false);

  // Reset the fade when the clip changes (slug switch reuses this slot).
  useEffect(() => setReady(false), [sources.webm, sources.mp4]);

  return (
    <video
      key={sources.webm}
      autoPlay
      muted
      playsInline
      preload="auto"
      poster={poster}
      aria-hidden="true"
      tabIndex={-1}
      onPlaying={() => setReady(true)}
      className={cn(
        "absolute inset-0 z-10 h-full w-full object-contain object-top transition-opacity duration-700",
        ready ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      <source src={sources.webm} type="video/webm" />
      <source src={sources.mp4} type="video/mp4" />
    </video>
  );
}
