"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  getMultiplierBannerImagePaths,
  BANNER_DIMENSIONS,
} from "@/utils/promo/multiplier-banner";

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

  useEffect(() => {
    setIndex(0);
  }, [multiplier, slug, toolsetSlug, pathKey]);

  if (paths.length === 0) {
    return null;
  }

  const safeIndex = Math.min(index, paths.length - 1);
  const src = paths[safeIndex]!;

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      priority={priority}
      sizes={sizes}
      onError={() => {
        if (safeIndex < paths.length - 1) {
          setIndex(safeIndex + 1);
        } else {
          onExhausted?.();
        }
      }}
    />
  );
}
