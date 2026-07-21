import { useMemo } from "react";
import {
  DEFAULT_PRIZE_SLUG,
  PRIZE_SUMMARIES,
  type PrizeSummary,
  type PrizeSlug,
  getPrizeSummaryBySlug,
  listPrizeSummaries,
} from "@/config/prize-summaries";

interface UsePrizeCatalogOptions {
  slug?: string | null;
}

interface UsePrizeCatalogResult {
  prizes: PrizeSummary[];
  defaultSlug: PrizeSlug;
  activePrize: PrizeSummary;
  activeSlug: PrizeSlug;
  resolvePrize: (slug: string) => PrizeSummary | undefined;
}

/**
 * Helper hook that exposes the shared prize catalog to components.
 * Keeps the logic for slug resolution and default fallbacks in one place
 * so newer developers do not need to re-implement it.
 *
 * Serves `PrizeSummary` (the lightweight client catalog from
 * `@/config/prize-summaries`) — NOT the deep spec-sheet entries. A component
 * that needs `specSections` must lazily `await import("@/config/prizes")`
 * at interaction time (see PrizeShowcase's specifications-modal handler).
 */
export function usePrizeCatalog(options: UsePrizeCatalogOptions = {}): UsePrizeCatalogResult {
  const prizes = useMemo(() => listPrizeSummaries(), []);
  const defaultSlug = DEFAULT_PRIZE_SLUG;

  const activePrize = useMemo(() => {
    if (options.slug) {
      const match = getPrizeSummaryBySlug(options.slug);
      if (match) {
        return match;
      }
    }
    return getPrizeSummaryBySlug(defaultSlug) ?? PRIZE_SUMMARIES[0];
  }, [options.slug, defaultSlug]);

  return {
    prizes,
    defaultSlug,
    activePrize,
    activeSlug: activePrize?.slug ?? defaultSlug,
    resolvePrize: getPrizeSummaryBySlug,
  };
}
