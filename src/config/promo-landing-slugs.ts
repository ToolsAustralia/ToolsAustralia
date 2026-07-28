/**
 * Toolset landing page configuration.
 * Maps toolset slugs (ryobi, milwaukee, dewalt, makita, hikoki) to prize slugs
 * and provides helpers for landing hero images.
 */

import type { PrizeSlug } from "./prizes";
import type { LandingHeroUrgency, ExtendedPromoImagePaths } from "@/utils/promo/promo-hero-types";
import {
  resolveLandingHeroImages,
  resolveLandingHeroImagesWithUrgency,
  resolveEvergreenHeroImages,
  resolveEvergreenHeroImagesWithUrgency,
  landingToolboxSuffixFromPrizeSlug,
} from "@/utils/promo/landing-image-resolver";
import { slugToBrandKey } from "@/config/brand-theme";

/**
 * Source of truth for the single-brand "toolset" promotion URLs (`/promotions/<slug>`).
 *
 * Adding a brand here flows through to everything that DERIVES from this list — including
 * the admin Overview "Prize performance" ROAS-by-brand card, the per-promotion analytics
 * funnel (PromoAnalyticsRepository), promo-slug validation, and Klaviyo brand attribution
 * (via `getAllBrandKeys`). When you add a brand, you also need: (1) its prize slugs in
 * `PrizeSlug`/`PRIZE_CATALOG` (./prizes.ts), (2) its `BrandKey` + theme (./brand-theme.ts),
 * (3) the `/images/brands/name/<slug>Text.svg` wordmark, and (4) its `/promotions/<slug>`
 * route. Full checklist in docs/config-and-data: "Adding a promotion brand".
 */
export const TOOLSET_LANDING_SLUGS = [
  "ryobi",
  "milwaukee",
  "dewalt",
  "makita",
  "hikoki",
] as const;

export type ToolsetLandingSlug = (typeof TOOLSET_LANDING_SLUGS)[number];

/** Map toolset slug to its prize slugs: Sidchrome, Kincrome, Milwaukee, GearWrench (draw 9). */
const TOOLSET_TO_PRIZE_SLUGS: Record<ToolsetLandingSlug, [PrizeSlug, PrizeSlug, PrizeSlug, PrizeSlug]> = {
  ryobi: ["ryobi-sidchrome", "ryobi-kincrome", "ryobi-milwaukee", "ryobi-gearwrench"],
  milwaukee: ["milwaukee-sidchrome", "milwaukee-kincrome", "milwaukee-milwaukee", "milwaukee-gearwrench"],
  dewalt: ["dewalt-sidchrome", "dewalt-kincrome", "dewalt-milwaukee", "dewalt-gearwrench"],
  makita: ["makita-sidchrome", "makita-kincrome", "makita-milwaukee", "makita-gearwrench"],
  hikoki: ["hikoki-sidchrome", "hikoki-kincrome", "hikoki-milwaukee", "hikoki-gearwrench"],
};

/**
 * Prize slug -> landing hero image paths with light/dark support.
 * Uses the new .webp assets with brand-specific folders.
 * null = use standard promo hero.
 */
const LANDING_HERO_MAP: Partial<Record<PrizeSlug, ExtendedPromoImagePaths>> = {
  /** Collage hero under `all-prizes/` (shared light/dark paths per viewport). */
  "cash-prize": resolveEvergreenHeroImages(),

  // Ryobi prizes — `sidTB` / `milTB` / `kinTB` resolved via `landingToolboxSuffixFromPrizeSlug`
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

  // HiKOKI prizes (landing art shipped 2026-06-23)
  "hikoki-sidchrome": resolveLandingHeroImages("hikoki", "sidTB"),
  "hikoki-milwaukee": resolveLandingHeroImages("hikoki", "milTB"),

  // GearWrench prizes — the fourth toolbox, landing art shipped with draw 9 (2026-07-27).
  // `ryobi-gearwrench` followed on 2026-07-28, completing the set; every toolset × toolbox
  // pairing now has a hero of its own rather than leaning on the resolver's fallback chain.
  "milwaukee-gearwrench": resolveLandingHeroImages("milwaukee", "gwTB"),
  "dewalt-gearwrench": resolveLandingHeroImages("dewalt", "gwTB"),
  "makita-gearwrench": resolveLandingHeroImages("makita", "gwTB"),
  "hikoki-gearwrench": resolveLandingHeroImages("hikoki", "gwTB"),
  "ryobi-gearwrench": resolveLandingHeroImages("ryobi", "gwTB"),
};

export function isToolsetLandingSlug(slug: string): slug is ToolsetLandingSlug {
  return TOOLSET_LANDING_SLUGS.includes(slug as ToolsetLandingSlug);
}

/**
 * Default prize slug for a toolset page.
 * Prefers Milwaukee toolbox first (Milwaukee stack + power toolset).
 */
export function getDefaultPrizeForToolsetSlug(slug: ToolsetLandingSlug): PrizeSlug {
  const [sidchrome, , milwaukee] = TOOLSET_TO_PRIZE_SLUGS[slug];
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
