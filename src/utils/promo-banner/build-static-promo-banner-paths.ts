import type { PromoBannerAssetBrand } from "./resolve-promo-banner-asset-brand";
import { bannerMultiplierFileKey } from "./banner-multiplier-file-key";
import type { PromoMultiplierWithAssets } from "@/types/promo-multiplier";

export type StaticPromoBannerFamily = "drawn-tonight" | "drawn-tomorrow" | "last-chance" | "ends-tonight";

const DEFAULT_BRAND: PromoBannerAssetBrand = "Milwaukee";

function brandedPath(brand: PromoBannerAssetBrand, family: StaticPromoBannerFamily, m: PromoMultiplierWithAssets): string {
  switch (family) {
    case "drawn-tonight":
      return `/images/promoBanner/${brand}/DrawnTonight/drawn-tonight-${m}x.webp`;
    case "drawn-tomorrow":
      return `/images/promoBanner/${brand}/DrawnTomorrow/drawn-tomorrow-${m}x.webp`;
    case "last-chance":
      return `/images/promoBanner/${brand}/LastChance/last-chance-${m}x.webp`;
    case "ends-tonight":
      return `/images/promoBanner/${brand}/EndsTonight/ends-tonight-${m}x.webp`;
    default: {
      const _exhaustive: never = family;
      return _exhaustive;
    }
  }
}

/** Pre–brand-layout root folders under `public/images/promoBanner/`. */
function legacyUnbrandedPath(family: StaticPromoBannerFamily, m: PromoMultiplierWithAssets): string {
  switch (family) {
    case "drawn-tonight":
      return `/images/promoBanner/DrawnTonight/drawn-tonight-${m}x.webp`;
    case "drawn-tomorrow":
      return `/images/promoBanner/DrawnTomorrow/drawn-tomorrow-${m}x.webp`;
    case "last-chance":
      return `/images/promoBanner/LastChance/last-chance-${m}x.webp`;
    case "ends-tonight":
      return `/images/promoBanner/EndsTonight/ends-tonight-${m}x.webp`;
    default: {
      const _exhaustive: never = family;
      return _exhaustive;
    }
  }
}

/**
 * Ordered URLs for static left art: requested brand → Milwaukee → legacy generic (no brand folder).
 * Use the first as `src` and the rest as `onError` fallbacks.
 */
export function buildStaticPromoBannerPaths(
  brand: PromoBannerAssetBrand,
  family: StaticPromoBannerFamily,
  multiplier: number | null
): string[] {
  const m = bannerMultiplierFileKey(multiplier);
  const primary = brandedPath(brand, family, m);
  const out: string[] = [primary];
  if (brand !== DEFAULT_BRAND) {
    out.push(brandedPath(DEFAULT_BRAND, family, m));
  }
  const legacy = legacyUnbrandedPath(family, m);
  if (!out.includes(legacy)) {
    out.push(legacy);
  }
  return out;
}
