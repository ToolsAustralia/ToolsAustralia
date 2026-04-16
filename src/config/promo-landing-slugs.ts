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
  landingToolboxSuffixFromPrizeSlug,
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
 * Uses the new .webp assets with brand-specific folders.
 * null = use standard promo hero.
 */
const LANDING_HERO_MAP: Partial<Record<PrizeSlug, ExtendedPromoImagePaths>> = {
  /** Collage hero under `all-prizes/` (desktop/mobile × light/dark). */
  "cash-prize": resolveEvergreenHeroImages(),

  // Ryobi prizes — Sidchrome TB vs Milwaukee TB assets (`sidTB` / `milTB`)
  "ryobi-sidchrome": resolveLandingHeroImages("ryobi", "sidTB"),
  "ryobi-milwaukee": resolveLandingHeroImages("ryobi", "milTB"),

  // Milwaukee prizes
  "milwaukee-sidchrome": resolveLandingHeroImages("milwaukee", "sidTB"),
  "milwaukee-milwaukee": resolveLandingHeroImages("milwaukee", "milTB"),

  // DeWalt prizes
  "dewalt-sidchrome": resolveLandingHeroImages("dewalt", "sidTB"),
  "dewalt-milwaukee": resolveLandingHeroImages("dewalt", "milTB"),

  // Makita prizes
  "makita-sidchrome": resolveLandingHeroImages("makita", "sidTB"),
  "makita-milwaukee": resolveLandingHeroImages("makita", "milTB"),
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
 * Prefers Milwaukee toolbox first (Milwaukee stack + power toolset).
 */
export function getDefaultPrizeForToolsetSlug(slug: ToolsetLandingSlug): PrizeSlug {
  const [sidchrome, milwaukee] = TOOLSET_TO_PRIZE_SLUGS[slug];
  const hasMilwaukeeHero = LANDING_HERO_MAP[milwaukee] != null;
  const hasSidchromeHero = LANDING_HERO_MAP[sidchrome] != null;
  if (hasMilwaukeeHero) return milwaukee;
  if (hasSidchromeHero) return sidchrome;
  return milwaukee;
}

/**
 * Returns landing hero image paths for a prize slug, or null to use standard promo hero.
 * Returns extended paths with light/dark variants.
 */
export function getLandingHeroImagePaths(prizeSlug: string): ExtendedPromoImagePaths | null {
  const mapped = LANDING_HERO_MAP[prizeSlug as PrizeSlug];
  if (mapped) return mapped;
  
  // Fallback: extract brand + toolbox from slug (e.g. future prize slugs)
  const brand = slugToBrandKey(prizeSlug);
  if (brand) return resolveLandingHeroImages(brand, landingToolboxSuffixFromPrizeSlug(prizeSlug));
  
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
