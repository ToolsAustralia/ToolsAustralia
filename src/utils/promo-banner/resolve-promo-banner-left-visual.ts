/**
 * Resolves the promo banner left-column image (variant > scheduled > static under public/images/promoBanner).
 * No network calls — returns relative paths or full URLs only.
 *
 * Static filenames: `{base}-{multiplier}x.png` where multiplier is 2|3|5|10. Missing assets should use 10x
 * until 2x/3x/5x exist in repo; `bannerMultiplierFileKey` maps unknown/null multipliers to 10.
 */

import { resolvePromoBannerAssetBrand } from "./resolve-promo-banner-asset-brand";
import { buildStaticPromoBannerPaths, type StaticPromoBannerFamily } from "./build-static-promo-banner-paths";

export { bannerMultiplierFileKey } from "./banner-multiplier-file-key";

export interface ResolvePromoBannerLeftVisualParams {
  variantLeftImageUrl?: string | null;
  scheduledImageUrl?: string | null;
  scheduledAltText?: string | null;
  /** Landing page slug (promo theme store); drives static asset brand with toolsetSlug. */
  slug?: string | null;
  /** Toolset landing slug when applicable; wins over slug first segment for brand folder. */
  toolsetSlug?: string | null;
  /** Draw calendar date is today (AEST), same notion as PromoBanner draw-status "today". */
  drawIsToday: boolean;
  /** scheduled promo active and &lt;24h to end (ENDS TONIGHT style). */
  scheduledPromoUrgent: boolean;
  /** `source === "scheduled"` with end date from effective-for-banner. */
  hasScheduledPromo: boolean;
  multiplier: number | null;
}

export interface ResolvePromoBannerLeftVisualResult {
  src: string;
  alt: string;
  /** Extra static URLs to try when `src` fails (same family + multiplier). Only set for static fallback chain. */
  srcFallbacks?: string[];
}

const DEFAULT_ALT = "Promo entries";

function trimUrl(url: string | null | undefined): string | null {
  const t = url?.trim();
  return t ? t : null;
}

function resolveStaticFamily(params: ResolvePromoBannerLeftVisualParams): StaticPromoBannerFamily {
  if (params.drawIsToday) return "drawn-tonight";
  if (params.hasScheduledPromo && params.scheduledPromoUrgent) return "ends-tonight";
  if (params.hasScheduledPromo) return "last-chance";
  return "last-chance";
}

export function resolvePromoBannerLeftVisual(
  params: ResolvePromoBannerLeftVisualParams
): ResolvePromoBannerLeftVisualResult {
  const variantUrl = trimUrl(params.variantLeftImageUrl);
  if (variantUrl) {
    return { src: variantUrl, alt: DEFAULT_ALT };
  }

  const scheduledUrl = trimUrl(params.scheduledImageUrl);
  if (scheduledUrl) {
    const alt = trimUrl(params.scheduledAltText) ?? DEFAULT_ALT;
    return { src: scheduledUrl, alt };
  }

  const family = resolveStaticFamily(params);
  const brand = resolvePromoBannerAssetBrand(params.slug ?? null, params.toolsetSlug ?? null);
  const paths = buildStaticPromoBannerPaths(brand, family, params.multiplier);
  const [src, ...srcFallbacks] = paths;
  return {
    src,
    alt: DEFAULT_ALT,
    ...(srcFallbacks.length > 0 ? { srcFallbacks } : {}),
  };
}
