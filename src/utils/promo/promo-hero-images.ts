/**
 * Promo Hero Image Path Resolution Utility
 * 
 * Centralized logic for resolving promotional hero image paths based on:
 * - Active promo multiplier (2x, 3x, 5x, 10x, or no-badge)
 * - Draw date status (today/tomorrow)
 * - A/B testing variant config overrides
 * 
 * Priority order:
 * 1. Variant config override (A/B testing)
 * 2. Draw date status (today/tomorrow)
 * 3. Multiplier-based selection (2x, 3x, 5x, 10x)
 * 4. Default fallback (no-badge)
 * 
 * @module promo-hero-images
 */

import type { 
  PromoImagePaths, 
  DrawDateStatus, 
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
const DEFAULT_VARIANT = "feb-no-badge";

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
 * @returns Image variant name (e.g., "feb-x10", "feb-no-badge")
 */
export function getMultiplierImageVariant(multiplier: number | null | undefined): string {
  if (!multiplier) {
    return DEFAULT_VARIANT;
  }

  switch (multiplier) {
    case 10:
      return "feb-x10";
    case 5:
      return "feb-x5";
    case 3:
      return "feb-x3";
    case 2:
      return "feb-x2";
    default:
      return DEFAULT_VARIANT;
  }
}

/**
 * Maps draw date status to image variant name
 * 
 * @param status - Draw date status ("today", "tomorrow", or null)
 * @returns Image variant name (e.g., "feb-drawn-tonight", "feb-drawn-tomorrow")
 */
export function getDrawDateImageVariant(status: DrawDateStatus): string | null {
  switch (status) {
    case "tomorrow":
      return "feb-drawn-tomorrow";
    case "today":
      return "feb-drawn-tonight";
    default:
      return null;
  }
}

/**
 * Builds full image paths from variant name
 * Constructs both desktop and mobile paths following the naming convention:
 * - Desktop: /images/background/promo/feb-{variant}.webp
 * - Mobile: /images/background/promo/feb-{variant}-mobile.webp
 * 
 * @param variant - Image variant name (e.g., "feb-x10", "feb-no-badge")
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
 * Implements the priority logic: Variant config > Draw date > Multiplier > Default
 * 
 * @param params - Parameters for image resolution
 * @returns PromoImagePaths object with desktop and mobile image paths
 * 
 * @example
 * ```typescript
 * // Multiplier-based selection
 * const paths = getPromoImagePaths({ multiplier: 10 });
 * // Returns: { desktop: "/images/background/promo/feb-x10.webp", mobile: "/images/background/promo/feb-x10-mobile.webp" }
 * 
 * // Draw date override
 * const paths = getPromoImagePaths({ multiplier: 10, drawDateStatus: "tomorrow" });
 * // Returns: { desktop: "/images/background/promo/feb-drawn-tomorrow.webp", mobile: "/images/background/promo/feb-drawn-tomorrow-mobile.webp" }
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
  const { multiplier, drawDateStatus, variantImageOverride } = params;

  // Priority 1: Variant config override (A/B testing)
  // This takes highest priority and overrides everything else
  if (variantImageOverride) {
    return resolveVariantImageOverride(variantImageOverride);
  }

  // Priority 2: Draw date status (today/tomorrow)
  // If draw is happening today or tomorrow, use date-based images
  if (drawDateStatus) {
    const drawDateVariant = getDrawDateImageVariant(drawDateStatus);
    if (drawDateVariant) {
      return buildImagePaths(drawDateVariant);
    }
  }

  // Priority 3: Multiplier-based selection
  // Map multiplier to image variant and build paths
  const multiplierVariant = getMultiplierImageVariant(multiplier ?? null);
  return buildImagePaths(multiplierVariant);
}
