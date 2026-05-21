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
 * Extended image paths with light/dark mode support
 * Contains all 4 variants: desktop/mobile × light/dark
 */
export interface ExtendedPromoImagePaths {
  desktop: string;
  mobile: string;
  desktopDark: string;
  mobileDark: string;
}

/**
 * Draw date status for conditional image selection (e.g. promo banner countdown copy)
 */
export type DrawDateStatus = "today" | "tomorrow" | null;

/**
 * Landing folder assets use three tiers (see `getLandingHeroUrgencyFromMsUntil`).
 */
export type LandingHeroUrgency = "final-hours" | "drawn-tomorrow" | "drawn-tonight";

/**
 * Major draw countdown tier for promo hero backgrounds (matches assets under /images/background/promo).
 * `drawn-tomorrow` maps to `mar-final-hours` until a dedicated mar asset exists.
 */
export type MajorDrawHeroUrgency = LandingHeroUrgency;

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
  /** Major draw within 72h / 48h / 24h — selects mar-final-hours / mar-drawn-tonight hero art */
  majorDrawUrgency?: MajorDrawHeroUrgency | null;
  /** Variant config override from A/B testing (optional) */
  variantImageOverride?: VariantImageOverride;
}
