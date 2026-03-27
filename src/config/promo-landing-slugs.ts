/**
 * Toolset landing page configuration.
 * Maps toolset slugs (ryobi, milwaukee, dewalt, makita) to prize slugs
 * and provides helpers for landing hero images.
 */

import type { PrizeSlug } from "./prizes";
import type { MajorDrawHeroUrgency, ExtendedPromoImagePaths } from "@/utils/promo/promo-hero-types";
import {
  resolveLandingHeroImages,
  resolveEvergreenHeroImages,
} from "@/utils/promo/landing-image-resolver";
import { slugToBrandKey } from "@/config/brand-theme";

export const TOOLSET_LANDING_SLUGS = [
  "ryobi",
  "milwaukee",
  "dewalt",
  "makita",
] as const;

export type ToolsetLandingSlug = (typeof TOOLSET_LANDING_SLUGS)[number];

/** Map toolset slug to both prize slugs (Sidchrome first, Milwaukee second) */
const TOOLSET_TO_PRIZE_SLUGS: Record<ToolsetLandingSlug, [PrizeSlug, PrizeSlug]> = {
  ryobi: ["ryobi-sidchrome", "ryobi-milwaukee"],
  milwaukee: ["milwaukee-sidchrome", "milwaukee-milwaukee"],
  dewalt: ["dewalt-sidchrome", "dewalt-milwaukee"],
  makita: ["makita-sidchrome", "makita-milwaukee"],
};

/**
 * Prize slug -> landing hero image paths with light/dark support.
 * Uses the new .png assets with brand-specific folders.
 * null = use standard promo hero.
 */
const LANDING_HERO_MAP: Partial<Record<PrizeSlug, ExtendedPromoImagePaths>> = {
  /** Collage hero under `all-prizes/` (desktop/mobile × light/dark). */
  "cash-prize": resolveEvergreenHeroImages(),

  // Ryobi prizes
  "ryobi-sidchrome": resolveLandingHeroImages("ryobi"),
  "ryobi-milwaukee": resolveLandingHeroImages("ryobi"),
  
  // Milwaukee prizes
  "milwaukee-sidchrome": resolveLandingHeroImages("milwaukee"),
  "milwaukee-milwaukee": resolveLandingHeroImages("milwaukee"),
  
  // DeWalt prizes
  "dewalt-sidchrome": resolveLandingHeroImages("dewalt"),
  "dewalt-milwaukee": resolveLandingHeroImages("dewalt"),
  
  // Makita prizes
  "makita-sidchrome": resolveLandingHeroImages("makita"),
  "makita-milwaukee": resolveLandingHeroImages("makita"),
};

export function isToolsetLandingSlug(slug: string): slug is ToolsetLandingSlug {
  return TOOLSET_LANDING_SLUGS.includes(slug as ToolsetLandingSlug);
}

/**
 * Returns both prize slugs for a toolset landing page (Sidchrome first, Milwaukee second).
 */
export function getPrizesForToolsetSlug(slug: ToolsetLandingSlug): [PrizeSlug, PrizeSlug] {
  return TOOLSET_TO_PRIZE_SLUGS[slug];
}

/**
 * Default prize slug for a toolset page.
 * Uses prize variant that has landing hero images available:
 * - Ryobi: Sidchrome TB (sidchromeTb-ryobiSet)
 * - Milwaukee, DeWalt, Makita: Milwaukee TB (milwaukeeTb-{toolset}Set) until Sidchrome TB variants are ready
 */
export function getDefaultPrizeForToolsetSlug(slug: ToolsetLandingSlug): PrizeSlug {
  const [sidchrome, milwaukee] = TOOLSET_TO_PRIZE_SLUGS[slug];
  const hasMilwaukeeHero = LANDING_HERO_MAP[milwaukee] != null;
  const hasSidchromeHero = LANDING_HERO_MAP[sidchrome] != null;
  if (hasMilwaukeeHero) return milwaukee;
  if (hasSidchromeHero) return sidchrome;
  return sidchrome; // fallback to Sidchrome variant
}

/**
 * Returns landing hero image paths for a prize slug, or null to use standard promo hero.
 * Returns extended paths with light/dark variants.
 */
export function getLandingHeroImagePaths(prizeSlug: string): ExtendedPromoImagePaths | null {
  const mapped = LANDING_HERO_MAP[prizeSlug as PrizeSlug];
  if (mapped) return mapped;
  
  // Fallback: try to extract brand from slug
  const brand = slugToBrandKey(prizeSlug);
  if (brand) return resolveLandingHeroImages(brand);
  
  return null;
}

/**
 * Apply major draw urgency to landing paths
 * Note: Currently returns the same paths since multiplier assets don't exist yet.
 * This is a placeholder for future urgency variants.
 */
export function applyMajorDrawUrgencyToLandingPaths(
  paths: ExtendedPromoImagePaths,
  _urgency: MajorDrawHeroUrgency
): ExtendedPromoImagePaths {
  // For now, return the same paths since we're using "no-promo" images as fallback
  // When urgency variants are available, update this to insert urgency suffix
  return paths;
}
