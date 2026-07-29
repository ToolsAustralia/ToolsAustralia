/**
 * Landing Image Resolver
 *
 * Config-driven image resolution for promo landing pages.
 * Supports brand-specific images with light/dark mode and mobile/desktop variants.
 *
 * @module landing-image-resolver
 */

import { slugToBrandKey, type BrandKey } from "@/config/brand-theme";
import type { PromoImagePaths, ExtendedPromoImagePaths, LandingHeroUrgency } from "./promo-hero-types";
import { LANDING_IMAGE_MANIFEST } from "@/generated/landingImageManifest";

const LANDING_IMAGE_BASE = "/images/background/promo/landing";

/**
 * Shared hero "stage" background (the empty set the brand heroes are composited onto).
 * Rendered in place of the gray skeleton while the hero data loads, so the load-in is seamless.
 */
export const LANDING_HERO_BACKGROUND = {
  desktop: `${LANDING_IMAGE_BASE}/background/bg-desktop.webp`,
  mobile: `${LANDING_IMAGE_BASE}/background/bg-mobile.webp`,
} as const;

/**
 * Hero "stage" background for the loader, by THEME and viewport (draw 9, 2026-07-27).
 *
 * Four assets total: `bg-{desktop,mobile}[-dark].webp` — the bare backdrop the hero art is
 * composited onto, shown while the draw query resolves so the load-in is seamless rather
 * than a grey skeleton.
 *
 * This replaced a PER-BRAND scheme (`bg-{brand}-{viewport}.webp`, 10 files) that predated
 * dark mode. The backdrop is the same slat wall / diamond plate behind every brand's shoot,
 * so ten near-identical files bought nothing; what actually varies is the THEME, which the
 * old scheme could not express at all — a dark-mode visitor got the light backdrop and then
 * a dark hero painted over it. Brand is no longer an input, so the slug argument is gone.
 */
export function resolveLandingHeroBackground(
  mode: "light" | "dark" = "light"
): { desktop: string; mobile: string } {
  const darkSuffix = mode === "dark" ? "-dark" : "";
  const desktop = `${LANDING_IMAGE_BASE}/background/bg-desktop${darkSuffix}.webp`;
  const mobile = `${LANDING_IMAGE_BASE}/background/bg-mobile${darkSuffix}.webp`;
  return {
    desktop: LANDING_IMAGE_MANIFEST.has(desktop) ? desktop : LANDING_HERO_BACKGROUND.desktop,
    mobile: LANDING_IMAGE_MANIFEST.has(mobile) ? mobile : LANDING_HERO_BACKGROUND.mobile,
  };
}

/** Build the deterministic URL for a brand variant — no existence check. */
function buildLandingUrl(
  brand: BrandKey,
  mode: "light" | "dark",
  viewport: "desktop" | "mobile",
  toolboxSuffix: LandingHeroToolboxSuffix,
  urgency: LandingHeroUrgency | null
): string {
  const darkSuffix = mode === "dark" ? "-dark" : "";
  const mobileSuffix = viewport === "mobile" ? "-mobile" : "";
  const urgencySuffix = urgency ? `-${urgency}` : "";
  return `${LANDING_IMAGE_BASE}/${brand}/${brand}-${toolboxSuffix}${darkSuffix}${mobileSuffix}${urgencySuffix}.webp`;
}

/** Filename segment: Milwaukee, Sidchrome, Kincrome or GearWrench toolbox under `landing/{brand}/`. */
export type LandingHeroToolboxSuffix = "milTB" | "sidTB" | "kinTB" | "gwTB";

/**
 * Image naming conventions for landing pages:
 * - Desktop light: {brand}-{milTB|sidTB|kinTB|gwTB}.webp
 * - Desktop dark: {brand}-{milTB|sidTB|kinTB|gwTB}-dark.webp
 * - Mobile light: {brand}-{milTB|sidTB|kinTB|gwTB}-mobile.webp
 * - Mobile dark: {brand}-{milTB|sidTB|kinTB|gwTB}-dark-mobile.webp
 * - Urgency (after dark/mobile): -final-hours | -drawn-tomorrow | -drawn-tonight
 *
 * Evergreen (all-prizes): no separate dark filenames — dark mode uses the same file as light.
 *
 * No toolbox ships a `-final-hours` tier, so a `final-hours` request drops the tier and
 * resolves the base hero (see resolveLandingHeroImage).
 *
 * **Dark art is real as of the Draw 9 export (2026-07-27).** Before it, no `*-dark.webp` had
 * ever shipped and the light↔dark fallback below silently served the light file to dark-mode
 * users. Every brand × toolbox now ships all 12 variants (3 tiers × 2 viewports × 2 modes),
 * so that fallback is now a genuine safety net rather than the normal path.
 *
 * GearWrench (`gwTB`) joined in Draw 9. Its Ryobi pairing landed a day later (2026-07-28),
 * so as of then every brand × toolbox pair — `gwTB` included — resolves to a real file in
 * every mode, viewport and tier. No pair relies on the fallback chain as its normal path.
 */

/**
 * Resolve landing hero image path for a specific brand, mode, and viewport.
 *
 * If the requested file is not in the on-disk manifest, falls back to the
 * opposite-mode variant (light↔dark) before giving up. This handles cases
 * where the art team has shipped only one mode for a given brand/toolbox
 * (e.g. sidTB light bases were never produced).
 *
 * @param brand - Brand identifier
 * @param mode - Theme mode (light or dark)
 * @param viewport - Viewport size (desktop or mobile)
 * @returns Image path (manifest-verified when possible)
 */
export function resolveLandingHeroImage(
  brand: BrandKey,
  mode: "light" | "dark",
  viewport: "desktop" | "mobile",
  toolboxSuffix: LandingHeroToolboxSuffix = "milTB",
  urgency: LandingHeroUrgency | null = null
): string {
  const desired = buildLandingUrl(brand, mode, viewport, toolboxSuffix, urgency);
  if (LANDING_IMAGE_MANIFEST.has(desired)) return desired;

  const oppositeMode = mode === "dark" ? "light" : "dark";
  const opposite = buildLandingUrl(brand, oppositeMode, viewport, toolboxSuffix, urgency);
  if (LANDING_IMAGE_MANIFEST.has(opposite)) return opposite;

  /**
   * The requested countdown tier isn't shipped for this toolbox in either mode (e.g. no
   * `final-hours` art ships for any landing toolbox; only `-drawn-tomorrow` / `-drawn-tonight`
   * do). Drop the tier and resolve the base hero rather than returning a broken URL.
   */
  if (urgency != null) return resolveLandingHeroImage(brand, mode, viewport, toolboxSuffix, null);

  /**
   * Nothing exists for this brand × toolbox in EITHER mode at ANY tier — the whole
   * combination was never produced. Draw 9 created the first real instance of this:
   * GearWrench shipped for four toolsets but never for Ryobi.
   *
   * This used to `return desired` "so the failure is visible", which was fine while it could
   * not actually happen. It can now, and the failure it produces is not a visible placeholder
   * but a **400 from `/_next/image`** — a blank hero plus a console error, on a real customer
   * page. Fall back to the evergreen collage instead: it is a genuine, shipped image and an
   * honest "here is the prize range" answer, rather than showing the wrong toolbox.
   */
  return resolveEvergreenHeroImage(mode, viewport, null);
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
  const base = `${LANDING_IMAGE_BASE}/all-prizes/all-prizes${mobileSuffix}.webp`;
  if (!urgency) return base;

  /** Evergreen ships no countdown art — fall back to the base collage if the tier asset is absent. */
  const withUrgency = `${LANDING_IMAGE_BASE}/all-prizes/all-prizes${mobileSuffix}-${urgency}.webp`;
  return LANDING_IMAGE_MANIFEST.has(withUrgency) ? withUrgency : base;
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
 * Map prize slug to landing asset toolbox segment (`*-sidchrome` → sidTB, `*-kincrome` → kinTB,
 * `*-gearwrench` → gwTB, else milTB).
 */
export function landingToolboxSuffixFromPrizeSlug(prizeSlug: string): LandingHeroToolboxSuffix {
  const lower = prizeSlug.toLowerCase();
  if (lower.endsWith("-sidchrome")) return "sidTB";
  if (lower.endsWith("-kincrome")) return "kinTB";
  if (lower.endsWith("-gearwrench")) return "gwTB";
  return "milTB";
}
