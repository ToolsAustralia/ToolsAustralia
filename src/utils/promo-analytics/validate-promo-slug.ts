import { listPrizeSummaries } from "@/config/prize-summaries";
import { TOOLSET_LANDING_SLUGS, isToolsetLandingSlug } from "@/config/promo-landing-slugs";
import type { PromoPageType } from "@/models/PromoAnalyticsVisit";

// Use Set<string> for runtime membership checks (slug values are strings at runtime)
const EVERGREEN_SLUGS = new Set(listPrizeSummaries().map((p) => p.slug)) as Set<string>;
const TOOLSET_SLUGS_SET = new Set(TOOLSET_LANDING_SLUGS) as Set<string>;

/**
 * Validates that a slug is a known promotion page slug (evergreen or toolset).
 */
export function isValidPromoSlug(slug: string): boolean {
  const lower = slug.toLowerCase().trim();
  return EVERGREEN_SLUGS.has(lower) || TOOLSET_SLUGS_SET.has(lower);
}

/**
 * Derives page type from slug.
 * Toolset: ryobi, milwaukee, dewalt, makita
 * Evergreen: all prize slugs (ryobi-milwaukee, cash-prize, etc.)
 */
export function getPageTypeFromSlug(slug: string): PromoPageType {
  const lower = slug.toLowerCase().trim();
  return isToolsetLandingSlug(lower) ? "toolset" : "evergreen";
}
