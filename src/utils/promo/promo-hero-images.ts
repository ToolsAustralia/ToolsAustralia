/**
 * Promo Hero Image Path Resolution Utility
 * 
 * Centralized logic for resolving promotional hero image paths based on:
 * - Active promo multiplier (2x, 3x, 5x, 10x, or no-badge)
 * - Major draw urgency (final-hours / drawn-tonight from time until draw)
 * - A/B testing variant config overrides
 * 
 * Priority order:
 * 1. Variant config override (A/B testing)
 * 2. Major draw urgency (mar-final-hours / mar-drawn-tonight)
 * 3. Multiplier-based selection (2x, 3x, 5x, 10x)
 * 4. Default fallback (no-badge)
 * 
 * @module promo-hero-images
 */

import type { 
  PromoImagePaths, 
  MajorDrawHeroUrgency, 
  VariantImageOverride,
  PromoImageResolutionParams 
} from "./promo-hero-types";

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

/**
 * Time-until-draw → hero urgency (standard + landing suffixes).
 * - Under 24h remaining: drawn-tonight
 * - 24h or more, up to and including 72h: final-hours
 */
export function getMajorDrawHeroUrgencyFromDrawDate(
  drawDate: string | Date | null | undefined
): MajorDrawHeroUrgency | null {
  if (drawDate == null) return null;
  const msUntil = new Date(drawDate).getTime() - Date.now();
  if (msUntil <= 0) return null;
  if (msUntil < 24 * HOUR_MS) return "drawn-tonight";
  if (msUntil <= 72 * HOUR_MS) return "final-hours";
  return null;
}
