"use client";

import { cn } from "@/utils/cn";
import type { LandingVideoSources } from "@/utils/promo/landing-video-resolver";

/**
 * Muted hero video for a promo landing page. Plays through **once** (no loop) and holds on its
 * last frame, which matches the still hero. It is the **primary** hero (rendered in place of the
 * still, opaque from mount) and plays from its first frame — the clips open on a blank frame, so
 * passing the end-state still as a `poster` would flash the finished art before the animation;
 * `poster` is therefore optional and normally omitted (the white opening frame matches the
 * container background). `sources.srcs` is an ordered MP4 list (a drawn-tier clip falls back to
 * the base clip); the browser plays the first that loads. If every `<source>` fails it calls
 * `onUnavailable` so the caller can fall back to the still. The caller owns gating (reduced-motion
 * via CSS / viewport).
 */
export default function LandingHeroVideo({
  sources,
  poster,
  className,
  onUnavailable,
}: {
  sources: LandingVideoSources;
  poster?: string;
  className?: string;
  onUnavailable?: () => void;
}) {
  return (
    <video
      key={sources.srcs[0]}
      autoPlay
      muted
      playsInline
      preload="auto"
      poster={poster}
      aria-hidden="true"
      tabIndex={-1}
      onError={() => onUnavailable?.()}
      className={cn(
        "absolute inset-0 z-10 h-full w-full object-contain object-top",
        className,
      )}
    >
      {sources.srcs.map((src) => (
        <source key={src} src={src} type="video/mp4" />
      ))}
    </video>
  );
}
