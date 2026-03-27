/**
 * Multiplier Banner Utility
 * 
 * Maps promo multiplier values to banner image paths.
 * Used by MembershipSection to display multiplier banners.
 * 
 * @module multiplier-banner
 */

const BANNER_BASE_PATH = "/images/banners/multiplier";

/**
 * Get banner image path for a multiplier value
 * @param multiplier - Promo multiplier (2, 3, 5, or 10)
 * @returns Banner image path, or null if no banner exists for this multiplier
 */
export function getMultiplierBannerPath(multiplier: number | null | undefined): string | null {
  if (!multiplier || multiplier <= 1) {
    return null;
  }

  // Map multiplier to banner filename
  switch (multiplier) {
    case 2:
      return `${BANNER_BASE_PATH}/2x-banner.png`;
    case 3:
      return `${BANNER_BASE_PATH}/3x-banner.png`;
    case 5:
      return `${BANNER_BASE_PATH}/5x-banner.png`;
    case 10:
      return `${BANNER_BASE_PATH}/10x-banner.png`;
    default:
      return null;
  }
}

/**
 * Check if a banner exists for the given multiplier
 * @param multiplier - Promo multiplier
 * @returns True if a banner exists
 */
export function hasMultiplierBanner(multiplier: number | null | undefined): boolean {
  return getMultiplierBannerPath(multiplier) !== null;
}

/**
 * Get banner dimensions for responsive sizing
 * Banners are designed with a specific aspect ratio
 */
export const BANNER_DIMENSIONS = {
  width: 800,
  height: 200,
  aspectRatio: 4, // 4:1 aspect ratio
} as const;
