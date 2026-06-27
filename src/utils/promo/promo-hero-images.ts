/**
 * Promo Hero Image Path Resolution Utility
 * 
 * Centralized logic for resolving promotional hero image paths based on:
 * - Active promo multiplier (2x, 3x, 5x, 10x, or no-badge)
 * - Major draw urgency (final-hours / drawn-tomorrow / drawn-tonight from time until min(draw, freeze))
 * - A/B testing variant config overrides
 * 
 * Priority order:
 * 1. Variant config override (A/B testing)
 * 2. Major draw urgency (mar-final-hours / mar-drawn-tonight; drawn-tomorrow uses mar-final-hours)
 * 3. Multiplier-based selection (2x, 3x, 5x, 10x)
 * 4. Default fallback (no-badge)
 * 
 * @module promo-hero-images
 */

import { formatInTimeZone } from "date-fns-tz";
import { createAESTDateAsUTC } from "@/utils/common/timezone";
import type {
  PromoImagePaths,
  MajorDrawHeroUrgency,
  LandingHeroUrgency,
  VariantImageOverride,
  PromoImageResolutionParams,
} from "./promo-hero-types";

/** Display timezone — draws are scheduled and shown in Australian Eastern time. */
const AEST_TIMEZONE = "Australia/Sydney";

/**
 * Base path for promo hero images
 */
const PROMO_IMAGE_BASE_PATH = "/images/background/promo";

/**
 * Default image variant (no-badge)
 */
const DEFAULT_VARIANT = "mar-no-badge";

/**
 * Resolves variant image override to PromoImagePaths
 * Handles both string (backward compatible) and object (new format) formats
 * 
 * @param override - Variant config image override (string or PromoImagePaths)
 * @returns PromoImagePaths object with desktop and mobile paths
 */
export function resolveVariantImageOverride(
  override: VariantImageOverride
): PromoImagePaths {
  // If it's a string, apply the same path to both mobile and desktop
  if (typeof override === "string") {
    return {
      desktop: override,
      mobile: override,
    };
  }
  
  // If it's already a PromoImagePaths object, return it as-is
  return override;
}

/**
 * Maps multiplier value to image variant name
 * 
 * @param multiplier - Active promo multiplier (2, 3, 5, 10, or null)
 * @returns Image variant name (e.g., "mar-x10", "mar-no-badge")
 */
export function getMultiplierImageVariant(multiplier: number | null | undefined): string {
  if (!multiplier) {
    return DEFAULT_VARIANT;
  }

  switch (multiplier) {
    case 10:
      return "mar-x10";
    case 5:
      return "mar-x5";
    case 3:
      return "mar-x3";
    case 2:
      return "mar-no-badge"; // No mar-x2; use no-badge fallback
    case 12:
    case 15:
    case 20:
      return DEFAULT_VARIANT; // Dedicated hero variants can be wired when assets ship
    default:
      return DEFAULT_VARIANT;
  }
}

/**
 * Maps major-draw countdown tier to root promo image variant (mar-* assets).
 */
export function getMajorDrawUrgencyImageVariant(urgency: MajorDrawHeroUrgency | null | undefined): string | null {
  switch (urgency) {
    case "final-hours":
      return "mar-final-hours";
    case "drawn-tomorrow":
      return "mar-final-hours";
    case "drawn-tonight":
      return "mar-drawn-tonight";
    default:
      return null;
  }
}

/**
 * Builds full image paths from variant name
 * Constructs both desktop and mobile paths following the naming convention:
 * - Desktop: /images/background/promo/mar-{variant}.webp
 * - Mobile: /images/background/promo/mar-{variant}-mobile.webp
 * 
 * @param variant - Image variant name (e.g., "mar-x10", "mar-no-badge")
 * @returns PromoImagePaths object with desktop and mobile paths
 */
export function buildImagePaths(variant: string): PromoImagePaths {
  return {
    desktop: `${PROMO_IMAGE_BASE_PATH}/${variant}.webp`,
    mobile: `${PROMO_IMAGE_BASE_PATH}/${variant}-mobile.webp`,
  };
}

/**
 * Main function to resolve promo hero image paths
 * Implements the priority logic: Variant config > Major draw urgency > Multiplier > Default
 * 
 * @param params - Parameters for image resolution
 * @returns PromoImagePaths object with desktop and mobile image paths
 * 
 * @example
 * ```typescript
 * // Multiplier-based selection
 * const paths = getPromoImagePaths({ multiplier: 10 });
 * // Returns: { desktop: "/images/background/promo/mar-x10.webp", mobile: "/images/background/promo/mar-x10-mobile.webp" }
 * 
 * // Major draw urgency
 * const paths = getPromoImagePaths({ multiplier: 10, majorDrawUrgency: "final-hours" });
 * 
 * // Variant config override
 * const paths = getPromoImagePaths({ 
 *   multiplier: 10, 
 *   variantImageOverride: "/images/custom-hero.webp" 
 * });
 * // Returns: { desktop: "/images/custom-hero.webp", mobile: "/images/custom-hero.webp" }
 * ```
 */
export function getPromoImagePaths(
  params: PromoImageResolutionParams
): PromoImagePaths {
  const { multiplier, majorDrawUrgency, variantImageOverride } = params;

  // Priority 1: Variant config override (A/B testing)
  // This takes highest priority and overrides everything else
  if (variantImageOverride) {
    return resolveVariantImageOverride(variantImageOverride);
  }

  // Priority 2: Major draw urgency (time until draw)
  const urgencyVariant = getMajorDrawUrgencyImageVariant(majorDrawUrgency ?? null);
  if (urgencyVariant) {
    return buildImagePaths(urgencyVariant);
  }

  // Priority 3: Multiplier-based selection
  // Map multiplier to image variant and build paths
  const multiplierVariant = getMultiplierImageVariant(multiplier ?? null);
  return buildImagePaths(multiplierVariant);
}

const HOUR_MS = 60 * 60 * 1000;
const THREE_DAY_MS = 72 * HOUR_MS;

export type PromoUrgencyDrawLike = {
  drawDate?: string | Date | null;
  freezeEntriesAt?: string | Date | null;
};

/**
 * Earliest relevant instant: min(drawDate, freezeEntriesAt) among valid values.
 * Returns null if that instant is missing or not in the future.
 */
export function getPromoUrgencyDeadlineMs(draw: PromoUrgencyDrawLike | null | undefined): number | null {
  if (!draw) return null;
  const times: number[] = [];
  if (draw.drawDate != null) {
    const t = new Date(draw.drawDate).getTime();
    if (Number.isFinite(t)) times.push(t);
  }
  if (draw.freezeEntriesAt != null) {
    const t = new Date(draw.freezeEntriesAt).getTime();
    if (Number.isFinite(t)) times.push(t);
  }
  if (times.length === 0) return null;
  const deadline = Math.min(...times);
  if (deadline <= Date.now()) return null;
  return deadline;
}

/**
 * Milliseconds until deadline; null if no future deadline.
 */
export function getMsUntilPromoUrgencyDeadline(draw: PromoUrgencyDrawLike | null | undefined): number | null {
  const deadline = getPromoUrgencyDeadlineMs(draw);
  if (deadline == null) return null;
  return deadline - Date.now();
}

/**
 * Landing asset tier from time until deadline:
 * - &lt; 24h: drawn-tonight
 * - &lt; 48h: drawn-tomorrow
 * - &lt; 72h: final-hours
 * - else: null
 */
export function getLandingHeroUrgencyFromMsUntil(msUntil: number | null): LandingHeroUrgency | null {
  if (msUntil == null || msUntil <= 0) return null;
  if (msUntil < 24 * HOUR_MS) return "drawn-tonight";
  if (msUntil < 48 * HOUR_MS) return "drawn-tomorrow";
  if (msUntil < THREE_DAY_MS) return "final-hours";
  return null;
}

/**
 * Same tier bands as landing; used for mar-* hero selection.
 */
export function getMajorDrawHeroUrgencyFromMajorDraw(
  draw: PromoUrgencyDrawLike | null | undefined
): MajorDrawHeroUrgency | null {
  return getLandingHeroUrgencyFromMsUntil(getMsUntilPromoUrgencyDeadline(draw));
}

/** Midnight (00:00) of the AEST calendar day containing `d`, as epoch ms. DST-safe. */
function aestStartOfDayMs(d: Date): number {
  const year = parseInt(formatInTimeZone(d, AEST_TIMEZONE, "yyyy"), 10);
  const month = parseInt(formatInTimeZone(d, AEST_TIMEZONE, "M"), 10);
  const day = parseInt(formatInTimeZone(d, AEST_TIMEZONE, "d"), 10);
  return createAESTDateAsUTC(year, month, day, 0, 0).getTime();
}

/**
 * Landing-hero urgency keyed to the draw's **AEST calendar day** (not a rolling-hours window).
 *
 * For a draw on the 27th at 8:30pm AEST:
 * - the whole of the 26th (00:00–24:00 AEST)            → `drawn-tomorrow`
 * - the 27th from 00:00 AEST up to the 8:30pm draw time → `drawn-tonight`
 * - once the draw time passes, and any earlier day      → `null` (base brand hero)
 *
 * Uses `drawDate` only (the announced draw moment), independent of the entry-freeze window.
 * Returns only `drawn-tomorrow` / `drawn-tonight` — landing art ships no `final-hours` tier.
 */
export function getLandingHeroUrgencyFromDrawDay(
  draw: PromoUrgencyDrawLike | null | undefined,
  now: Date = new Date()
): LandingHeroUrgency | null {
  if (!draw?.drawDate) return null;
  const drawMs = new Date(draw.drawDate).getTime();
  if (!Number.isFinite(drawMs)) return null;

  const diffDays = Math.round((aestStartOfDayMs(new Date(drawMs)) - aestStartOfDayMs(now)) / (24 * HOUR_MS));
  if (diffDays === 0) return now.getTime() < drawMs ? "drawn-tonight" : null;
  if (diffDays === 1) return "drawn-tomorrow";
  return null;
}

/**
 * @deprecated Prefer {@link getMajorDrawHeroUrgencyFromMajorDraw} with freeze + drawDate.
 * Uses drawDate only (no freezeEntriesAt).
 */
export function getMajorDrawHeroUrgencyFromDrawDate(
  drawDate: string | Date | null | undefined
): MajorDrawHeroUrgency | null {
  return getMajorDrawHeroUrgencyFromMajorDraw({ drawDate });
}
