import type { PromoBannerAssetBrand } from "./resolve-promo-banner-asset-brand";
import { bannerMultiplierFileKey, specialPromoMultiplierFileKey } from "./banner-multiplier-file-key";
import type { PromoMultiplierWithAssets } from "@/types/promo-multiplier";

export type StaticPromoBannerFamily = "drawn-tonight" | "drawn-tomorrow" | "special-promo";

const DEFAULT_BRAND: PromoBannerAssetBrand = "Milwaukee";

function brandedPath(brand: PromoBannerAssetBrand, family: StaticPromoBannerFamily, m: PromoMultiplierWithAssets): string {
  switch (family) {
    case "drawn-tonight":
      return `/images/promoBanner/${brand}/DrawnTonight/drawn-tonight-${m}x.webp`;
    case "drawn-tomorrow":
      return `/images/promoBanner/${brand}/DrawnTomorrow/drawn-tomorrow-${m}x.webp`;
    case "special-promo":
      return `/images/promoBanner/${brand}/SpecialPromo/special-promo-${m}x.webp`;
    default: {
      const _exhaustive: never = family;
      return _exhaustive;
    }
  }
}

/**
 * Pre–brand-layout root folders under `public/images/promoBanner/`.
 * SpecialPromo never had a flat layout, so it has no legacy fallback.
 */
function legacyUnbrandedPath(family: StaticPromoBannerFamily, m: PromoMultiplierWithAssets): string | null {
  switch (family) {
    case "drawn-tonight":
      return `/images/promoBanner/DrawnTonight/drawn-tonight-${m}x.webp`;
    case "drawn-tomorrow":
      return `/images/promoBanner/DrawnTomorrow/drawn-tomorrow-${m}x.webp`;
    case "special-promo":
      return null;
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
  const m = family === "special-promo"
    ? specialPromoMultiplierFileKey(multiplier)
    : bannerMultiplierFileKey(multiplier);
  const primary = brandedPath(brand, family, m);
  const out: string[] = [primary];
  if (brand !== DEFAULT_BRAND) {
    out.push(brandedPath(DEFAULT_BRAND, family, m));
  }
  const legacy = legacyUnbrandedPath(family, m);
  if (legacy && !out.includes(legacy)) {
    out.push(legacy);
  }
  return out;
}
