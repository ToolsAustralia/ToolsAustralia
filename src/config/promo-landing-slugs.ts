/**
 * Toolset landing page configuration.
 * Maps toolset slugs (ryobi, milwaukee, dewalt, makita) to prize slugs
 * and provides helpers for landing hero images.
 */

import type { PrizeSlug } from "./prizes";
import type { PromoImagePaths } from "@/utils/promo/promo-hero-types";

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

const LANDING_IMAGE_BASE = "/images/background/promo/landing";

/** Prize slug -> landing hero image paths. null = use standard promo hero. */
const LANDING_HERO_MAP: Partial<Record<PrizeSlug, PromoImagePaths>> = {
  "ryobi-sidchrome": {
    desktop: `${LANDING_IMAGE_BASE}/sidchromeTb-ryobiSet.webp`,
    mobile: `${LANDING_IMAGE_BASE}/sidchromeTb-ryobiSet-mobile.webp`,
  },
  // Add more as images become available:
  // "ryobi-milwaukee": { desktop: "milwaukeeTb-ryobiSet.webp", mobile: "milwaukeeTb-ryobiSet-mobile.webp" },
  // etc.
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
 * Default prize slug for a toolset page (Sidchrome variant).
 */
export function getDefaultPrizeForToolsetSlug(slug: ToolsetLandingSlug): PrizeSlug {
  return TOOLSET_TO_PRIZE_SLUGS[slug][0];
}

/**
 * Returns landing hero image paths for a prize slug, or null to use standard promo hero.
 */
export function getLandingHeroImagePaths(prizeSlug: string): PromoImagePaths | null {
  return LANDING_HERO_MAP[prizeSlug as PrizeSlug] ?? null;
}
