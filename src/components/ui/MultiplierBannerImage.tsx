"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  getMultiplierBannerImagePaths,
  BANNER_DIMENSIONS,
} from "@/utils/promo/multiplier-banner";
import { cn } from "@/utils/cn";

export type MultiplierBannerImageProps = {
  multiplier: number;
  /** Promo / prize slug (e.g. `dewalt-milwaukee`) — first segment selects brand when toolset. */
  slug: string | null;
  /** Toolset landing slug when on a toolset page — takes precedence over `slug`. */
  toolsetSlug: string | null;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  /** next/image sizes hint; defaults to a full-width banner heuristic. */
  sizes?: string;
  /** Fired after all candidate URLs fail to load. */
  onExhausted?: () => void;
};

/**
 * Multiplier strip art: brand asset when a toolset/theme is active, otherwise generic banner;
 * chained `onError` fallback from branded → generic.
 */
export default function MultiplierBannerImage({
  multiplier,
  slug,
  toolsetSlug,
  alt,
  className,
  width = BANNER_DIMENSIONS.width,
  height = BANNER_DIMENSIONS.height,
  priority,
  sizes = "(max-width: 768px) 100vw, 1024px",
  onExhausted,
}: MultiplierBannerImageProps) {
  const paths = getMultiplierBannerImagePaths(multiplier, slug, toolsetSlug);
  const pathKey = paths.join("|");
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setIndex(0);
    // A cached image does NOT fire onLoad after a src swap (branded→generic fallback, or the
    // promo-theme slug settling on client-side nav), which strands the shimmer forever. If the
    // freshly-set src is already complete, resolve immediately; otherwise wait for onLoad.
    const img = imgRef.current;
    setLoaded(!!(img && img.complete && img.naturalWidth > 0));
  }, [multiplier, slug, toolsetSlug, pathKey]);

  if (paths.length === 0) {
    return null;
  }

  const safeIndex = Math.min(index, paths.length - 1);
  const src = paths[safeIndex]!;

  return (
    <div className={cn("relative", className)}>
      <Image
        ref={imgRef}
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        sizes={sizes}
        className={cn(
          "h-auto w-full object-contain transition-opacity duration-500",
          loaded ? "opacity-100" : "opacity-0",
        )}
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (safeIndex < paths.length - 1) {
            setIndex(safeIndex + 1);
          } else {
            onExhausted?.();
          }
        }}
      />

      {/* Branded loader while the multiplier art streams in. Sits in the image's
          reserved box (next/Image keeps the aspect-ratio), so there is no shift. */}
      {!loaded && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border border-black/5 bg-gradient-to-br from-neutral-100 to-neutral-200/70 dark:border-white/10 dark:from-neutral-800/50 dark:to-neutral-900/60"
          aria-label="Loading multiplier"
          role="status"
        >
          <div className="pointer-events-none absolute inset-0 animate-shimmer-horizontal-fast bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/10" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/Tools%20Australia%20Logo/Social_Media_Profile_Primary-removebg-preview.webp"
            alt=""
            draggable={false}
            className="relative h-8 w-8 animate-pulse object-contain drop-shadow-sm sm:h-11 sm:w-11"
          />
          <span className="relative bg-gradient-to-r from-red-600 via-orange-500 to-red-600 bg-clip-text text-[11px] font-black uppercase tracking-[0.14em] text-transparent sm:text-xs">
            Gearing up your multipliers…
          </span>
        </div>
      )}
    </div>
  );
}
