/**
 * Promo Hero Image Types
 * 
 * Type definitions for responsive promotional hero images with clear separation
 * of concerns and type safety throughout the application.
 */

/**
 * Image paths for responsive hero images
 * Contains separate paths for desktop and mobile views
 */
export interface PromoImagePaths {
  desktop: string;
  mobile: string;
}

/**
 * Draw date status for conditional image selection
 * Used to determine if the draw is happening today or tomorrow
 */
export type DrawDateStatus = "today" | "tomorrow" | null;

/**
 * Variant config image override - supports both single path (backward compatible)
 * and separate mobile/desktop paths (new format)
 * 
 * - Single string: Applies the same image to both mobile and desktop
 * - PromoImagePaths object: Provides separate paths for mobile and desktop
 */
export type VariantImageOverride = 
  | string  // Single path (applies to both mobile/desktop - backward compatible)
  | PromoImagePaths;  // Separate paths for mobile/desktop (new format)

/**
 * Parameters for resolving promo hero image paths
 * Used by the utility function to determine which images to use
 */
export interface PromoImageResolutionParams {
  /** Active promo multiplier (2, 3, 5, 10, or null for no-badge) */
  multiplier?: number | null;
  /** Draw date status if draw is today or tomorrow */
  drawDateStatus?: DrawDateStatus;
  /** Variant config override from A/B testing (optional) */
  variantImageOverride?: VariantImageOverride;
}
