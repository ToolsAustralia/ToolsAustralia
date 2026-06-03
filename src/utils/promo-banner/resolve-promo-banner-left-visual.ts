/**
 * Resolves the promo banner left-column image (Easter 2026 Holiday art > variant > scheduled > static).
 * Holiday takeover wins whenever the AEST calendar is Apr 3–6 2026 (or dev preview is set).
 * No network calls — returns relative paths or full URLs only.
 *
 * Static families: DrawnTonight / DrawnTomorrow keep `{base}-{2|3|5|10}x.webp`; every other state uses
 * SpecialPromo `special-promo-{3|5|10}x.webp`. Unknown/null (and 2x) multipliers map to 10x —
 * see `bannerMultiplierFileKey` / `specialPromoMultiplierFileKey`.
 */

import {
  buildHolidayPromoBannerPaths,
  getActiveHolidayPromoSlot,
  holidayPromoAltText,
  type HolidayPromoSlot,
} from "./holiday-promo-banner";
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
  /** True when time until freeze is positive and ≤48h (matches PromoBanner freeze countdown window). */
  within48HoursOfFreeze: boolean;
  multiplier: number | null;
  /**
   * Development only: force Holiday-folder slot (`promoHoliday` preview). Production callers omit this.
   */
  holidayDevPreview?: HolidayPromoSlot | null;
}

export interface ResolvePromoBannerLeftVisualResult {
  src: string;
  alt: string;
  /** Extra static URLs to try when `src` fails (same family + multiplier). Only set for static fallback chain. */
  srcFallbacks?: string[];
  /** Set only for brand assets under `public/images/promoBanner` (not variant/scheduled URLs). */
  staticFamily?: StaticPromoBannerFamily;
  /** True when using `{Brand}/Holiday/*.webp` for the long-weekend campaign. */
  isHolidayVisual?: boolean;
}

const DEFAULT_ALT = "Promo entries";

function trimUrl(url: string | null | undefined): string | null {
  const t = url?.trim();
  return t ? t : null;
}

function resolveStaticFamily(params: ResolvePromoBannerLeftVisualParams): StaticPromoBannerFamily {
  if (params.drawIsToday) return "drawn-tonight";
  if (params.within48HoursOfFreeze) return "drawn-tomorrow";
  return "special-promo";
}

export function resolvePromoBannerLeftVisual(
  params: ResolvePromoBannerLeftVisualParams
): ResolvePromoBannerLeftVisualResult {
  const holidaySlot = params.holidayDevPreview ?? getActiveHolidayPromoSlot();
  if (holidaySlot) {
    const brand = resolvePromoBannerAssetBrand(params.slug ?? null, params.toolsetSlug ?? null);
    const paths = buildHolidayPromoBannerPaths(brand, holidaySlot);
    const [src, ...srcFallbacks] = paths;
    return {
      src,
      alt: holidayPromoAltText(holidaySlot),
      isHolidayVisual: true,
      ...(srcFallbacks.length > 0 ? { srcFallbacks } : {}),
    };
  }

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
    staticFamily: family,
    ...(srcFallbacks.length > 0 ? { srcFallbacks } : {}),
  };
}
