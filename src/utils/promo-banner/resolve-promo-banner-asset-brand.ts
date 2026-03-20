import { isToolsetLandingSlug, TOOLSET_LANDING_SLUGS } from "@/config/promo-landing-slugs";

/** Folder names under `public/images/promoBanner/` (PascalCase). */
export type PromoBannerAssetBrand = "Dewalt" | "Makita" | "Milwaukee" | "Ryobi";

const DEFAULT_BRAND: PromoBannerAssetBrand = "Milwaukee";

const TOOLSET_SET = new Set<string>(TOOLSET_LANDING_SLUGS);

function toolsetSlugToBrandFolder(slug: string): PromoBannerAssetBrand {
  const lower = slug.toLowerCase();
  if (!TOOLSET_SET.has(lower)) return DEFAULT_BRAND;
  return (lower.charAt(0).toUpperCase() + lower.slice(1)) as PromoBannerAssetBrand;
}

/**
 * Maps promo theme context to static banner asset folder (brand).
 * Same inputs as {@link usePromoThemeStore}: landing `slug` + `toolsetSlug`.
 */
export function resolvePromoBannerAssetBrand(
  slug: string | null,
  toolsetSlug: string | null
): PromoBannerAssetBrand {
  if (toolsetSlug && isToolsetLandingSlug(toolsetSlug)) {
    return toolsetSlugToBrandFolder(toolsetSlug);
  }
  if (slug) {
    const first = slug.split("-")[0]?.toLowerCase();
    if (first && TOOLSET_SET.has(first)) {
      return toolsetSlugToBrandFolder(first);
    }
  }
  return DEFAULT_BRAND;
}
