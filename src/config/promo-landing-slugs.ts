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
  // Ryobi: Sidchrome TB images (default for ryobi)
  "ryobi-sidchrome": {
    desktop: `${LANDING_IMAGE_BASE}/sidchromeTb-ryobiSet.webp`,
    mobile: `${LANDING_IMAGE_BASE}/sidchromeTb-ryobiSet-mobile.webp`,
  },
  // Milwaukee, DeWalt, Makita: Milwaukee TB images (default until Sidchrome TB variants are ready)
  "milwaukee-milwaukee": {
    desktop: `${LANDING_IMAGE_BASE}/milwaukeeTb-milwaukeeSet.webp`,
    mobile: `${LANDING_IMAGE_BASE}/milwaukeeTb-milwaukeeSet-mobile.webp`,
  },
  "dewalt-milwaukee": {
    desktop: `${LANDING_IMAGE_BASE}/milwaukeeTb-dewaltSet.webp`,
    mobile: `${LANDING_IMAGE_BASE}/milwaukeeTb-dewaltSet-mobile.webp`,
  },
  "makita-milwaukee": {
    desktop: `${LANDING_IMAGE_BASE}/milwaukeeTb-makitaSet.webp`,
    mobile: `${LANDING_IMAGE_BASE}/milwaukeeTb-makitaSet-mobile.webp`,
  },
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
 */
export function getLandingHeroImagePaths(prizeSlug: string): PromoImagePaths | null {
  return LANDING_HERO_MAP[prizeSlug as PrizeSlug] ?? null;
}
