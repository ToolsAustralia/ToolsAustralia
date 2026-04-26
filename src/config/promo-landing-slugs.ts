/**
 * Toolset landing page configuration.
 * Maps toolset slugs (ryobi, milwaukee, dewalt, makita) to prize slugs
 * and provides helpers for landing hero images.
 */

import type { PrizeSlug } from "./prizes";
import type { LandingHeroUrgency, ExtendedPromoImagePaths } from "@/utils/promo/promo-hero-types";
import {
  resolveLandingHeroImagesWithUrgency,
  resolveEvergreenHeroImagesWithUrgency,
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

/** Map toolset slug to prize slugs: Sidchrome, Kincrome (centre), Milwaukee */
const TOOLSET_TO_PRIZE_SLUGS: Record<ToolsetLandingSlug, [PrizeSlug, PrizeSlug, PrizeSlug]> = {
  ryobi: ["ryobi-sidchrome", "ryobi-kincrome", "ryobi-milwaukee"],
  milwaukee: ["milwaukee-sidchrome", "milwaukee-kincrome", "milwaukee-milwaukee"],
  dewalt: ["dewalt-sidchrome", "dewalt-kincrome", "dewalt-milwaukee"],
  makita: ["makita-sidchrome", "makita-kincrome", "makita-milwaukee"],
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
 * Returns prize slugs for a toolset landing page: Sidchrome, Kincrome, Milwaukee.
 */
export function getPrizesForToolsetSlug(slug: ToolsetLandingSlug): [PrizeSlug, PrizeSlug, PrizeSlug] {
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

const CASH_PRIZE_SLUG = "cash-prize";

/**
 * Returns landing hero image paths for a prize slug, or null to use standard promo hero.
 * When `urgency` is set, paths include `-final-hours` / `-drawn-tomorrow` / `-drawn-tonight` suffixes.
 */
export function getLandingHeroImagePaths(
  prizeSlug: string,
  urgency: LandingHeroUrgency | null = null
): ExtendedPromoImagePaths | null {
  if (prizeSlug === CASH_PRIZE_SLUG) {
    return resolveEvergreenHeroImagesWithUrgency(urgency);
  }

  const brand = slugToBrandKey(prizeSlug);
  if (!brand) return null;

  return resolveLandingHeroImagesWithUrgency(brand, landingToolboxSuffixFromPrizeSlug(prizeSlug), urgency);
}

export type { LandingHeroUrgency } from "@/utils/promo/promo-hero-types";
