import { useMemo } from "react";
import {
  DEFAULT_PRIZE_SLUG,
  PRIZE_CATALOG,
  type PrizeCatalogEntry,
  type PrizeSlug,
  getPrizeBySlug,
  listPrizes,
} from "@/config/prizes";

interface UsePrizeCatalogOptions {
  slug?: string | null;
}

interface UsePrizeCatalogResult {
  prizes: PrizeCatalogEntry[];
  defaultSlug: PrizeSlug;
  activePrize: PrizeCatalogEntry;
  activeSlug: PrizeSlug;
  resolvePrize: (slug: string) => PrizeCatalogEntry | undefined;
}

/**
 * Helper hook that exposes the shared prize catalog to components.
 * Keeps the logic for slug resolution and default fallbacks in one place
 * so newer developers do not need to re-implement it.
 */
export function usePrizeCatalog(options: UsePrizeCatalogOptions = {}): UsePrizeCatalogResult {
  const prizes = useMemo(() => listPrizes(), []);
  const defaultSlug = DEFAULT_PRIZE_SLUG;

  const activePrize = useMemo(() => {
    if (options.slug) {
      const match = getPrizeBySlug(options.slug);
      if (match) {
        return match;
      }
    }
    return getPrizeBySlug(defaultSlug) ?? PRIZE_CATALOG[0];
  }, [options.slug, defaultSlug]);

  return {
    prizes,
    defaultSlug,
    activePrize,
    activeSlug: activePrize?.slug ?? defaultSlug,
    resolvePrize: getPrizeBySlug,
  };
}
