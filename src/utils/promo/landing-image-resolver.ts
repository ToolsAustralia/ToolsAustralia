/**
 * Landing Image Resolver
 *
 * Config-driven image resolution for promo landing pages.
 * Supports brand-specific images with light/dark mode and mobile/desktop variants.
 *
 * @module landing-image-resolver
 */

import type { BrandKey } from "@/config/brand-theme";
import type { PromoImagePaths, ExtendedPromoImagePaths, LandingHeroUrgency } from "./promo-hero-types";

const LANDING_IMAGE_BASE = "/images/background/promo/landing";

/** Filename segment: Sidchrome, Kincrome, or Milwaukee stack toolbox under `landing/{brand}/`. */
export type LandingHeroToolboxSuffix = "milTB" | "sidTB" | "kinTB";

/**
 * Image naming conventions for landing pages:
 * - Desktop light: {brand}-{milTB|sidTB|kinTB}.webp
 * - Desktop dark: {brand}-{milTB|sidTB|kinTB}-dark.webp
 * - Mobile light: {brand}-{milTB|sidTB|kinTB}-mobile.webp
 * - Mobile dark: {brand}-{milTB|sidTB|kinTB}-dark-mobile.webp
 * - Urgency (after dark/mobile): -final-hours | -drawn-tomorrow | -drawn-tonight
 *
 * Evergreen (all-prizes): no separate dark filenames — dark mode uses the same file as light.
 *
 * Kincrome (`kinTB`): dedicated toolbox art for all viewports. Urgency tiers reuse the same base
 * kinTB assets (no `-final-hours` / `-drawn-*` kinTB files).
 */

/**
 * Resolve landing hero image path for a specific brand, mode, and viewport
 * @param brand - Brand identifier
 * @param mode - Theme mode (light or dark)
 * @param viewport - Viewport size (desktop or mobile)
 * @returns Image path
 */
export function resolveLandingHeroImage(
  brand: BrandKey,
  mode: "light" | "dark",
  viewport: "desktop" | "mobile",
  toolboxSuffix: LandingHeroToolboxSuffix = "milTB",
  urgency: LandingHeroUrgency | null = null
): string {
  /** Kincrome heroes only ship base assets; urgency tiers reuse the same files. */
  if (toolboxSuffix === "kinTB" && urgency != null) {
    return resolveLandingHeroImage(brand, mode, viewport, "kinTB", null);
  }

  const darkSuffix = mode === "dark" ? "-dark" : "";
  const mobileSuffix = viewport === "mobile" ? "-mobile" : "";
  const urgencySuffix = urgency ? `-${urgency}` : "";

  return `${LANDING_IMAGE_BASE}/${brand}/${brand}-${toolboxSuffix}${darkSuffix}${mobileSuffix}${urgencySuffix}.webp`;
}

/**
 * Resolve all landing hero image variants for a brand
 * Returns all 4 variants: desktop/mobile × light/dark
 * @param brand - Brand identifier
 * @returns Extended promo image paths with all variants
 */
export function resolveLandingHeroImages(
  brand: BrandKey,
  toolboxSuffix: LandingHeroToolboxSuffix = "milTB"
): ExtendedPromoImagePaths {
  return resolveLandingHeroImagesWithUrgency(brand, toolboxSuffix, null);
}

/**
 * All four landing variants with optional countdown tier (matches `.webp` under `landing/{brand}/`).
 */
export function resolveLandingHeroImagesWithUrgency(
  brand: BrandKey,
  toolboxSuffix: LandingHeroToolboxSuffix = "milTB",
  urgency: LandingHeroUrgency | null = null
): ExtendedPromoImagePaths {
  return {
    desktop: resolveLandingHeroImage(brand, "light", "desktop", toolboxSuffix, urgency),
    mobile: resolveLandingHeroImage(brand, "light", "mobile", toolboxSuffix, urgency),
    desktopDark: resolveLandingHeroImage(brand, "dark", "desktop", toolboxSuffix, urgency),
    mobileDark: resolveLandingHeroImage(brand, "dark", "mobile", toolboxSuffix, urgency),
  };
}

/**
 * Resolve evergreen (all-prizes) hero image
 * @param mode - Theme mode (ignored for path; same asset as light)
 * @param viewport - Viewport size
 * @returns Image path
 */
export function resolveEvergreenHeroImage(
  _mode: "light" | "dark",
  viewport: "desktop" | "mobile",
  urgency: LandingHeroUrgency | null = null
): string {
  const mobileSuffix = viewport === "mobile" ? "-mobile" : "";
  const urgencySuffix = urgency ? `-${urgency}` : "";

  return `${LANDING_IMAGE_BASE}/all-prizes/all-prizes${mobileSuffix}${urgencySuffix}.webp`;
}

/**
 * Resolve all evergreen hero image variants
 * @returns Extended promo image paths for evergreen page
 */
export function resolveEvergreenHeroImages(): ExtendedPromoImagePaths {
  return resolveEvergreenHeroImagesWithUrgency(null);
}

export function resolveEvergreenHeroImagesWithUrgency(
  urgency: LandingHeroUrgency | null
): ExtendedPromoImagePaths {
  const desktop = resolveEvergreenHeroImage("light", "desktop", urgency);
  const mobile = resolveEvergreenHeroImage("light", "mobile", urgency);
  return {
    desktop,
    mobile,
    desktopDark: desktop,
    mobileDark: mobile,
  };
}

/**
 * Get the appropriate image path based on current theme and viewport
 * @param images - Extended promo image paths
 * @param mode - Theme mode
 * @param viewport - Viewport size
 * @returns Resolved image path
 */
export function getImageForMode(
  images: ExtendedPromoImagePaths,
  mode: "light" | "dark",
  viewport: "desktop" | "mobile"
): string {
  if (viewport === "mobile") {
    return mode === "dark" ? images.mobileDark : images.mobile;
  }
  return mode === "dark" ? images.desktopDark : images.desktop;
}

/**
 * Convert extended image paths to basic PromoImagePaths for a specific mode
 * @param images - Extended promo image paths
 * @param mode - Theme mode
 * @returns Basic promo image paths (desktop + mobile for one mode)
 */
export function toBasicImagePaths(
  images: ExtendedPromoImagePaths,
  mode: "light" | "dark"
): PromoImagePaths {
  return {
    desktop: mode === "dark" ? images.desktopDark : images.desktop,
    mobile: mode === "dark" ? images.mobileDark : images.mobile,
  };
}

/**
 * Get fallback image path (evergreen light desktop)
 * Used when brand-specific image fails to load
 * @returns Fallback image path
 */
export function getFallbackImagePath(): string {
  return resolveEvergreenHeroImage("light", "desktop");
}

/**
 * Map prize slug to landing asset toolbox segment (`*-sidchrome` → sidTB, `*-kincrome` → kinTB, else milTB).
 */
export function landingToolboxSuffixFromPrizeSlug(prizeSlug: string): LandingHeroToolboxSuffix {
  const lower = prizeSlug.toLowerCase();
  if (lower.endsWith("-sidchrome")) return "sidTB";
  if (lower.endsWith("-kincrome")) return "kinTB";
  return "milTB";
}
