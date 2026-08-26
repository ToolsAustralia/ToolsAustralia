import { isToolsetLandingSlug, TOOLSET_LANDING_SLUGS } from "@/config/promo-landing-slugs";

/** Folder names under `public/images/promoBanner/` (PascalCase). */
export type PromoBannerAssetBrand = "Dewalt" | "Hikoki" | "Makita" | "Milwaukee" | "Ryobi";

const DEFAULT_BRAND: PromoBannerAssetBrand = "Milwaukee";

const TOOLSET_SET = new Set<string>(TOOLSET_LANDING_SLUGS);

/**
 * Toolset slug -> the banner folder that ACTUALLY EXISTS on disk.
 *
 * This used to derive the folder by capitalising the slug, which quietly assumed every landing
 * toolset owns a `promoBanner/<Brand>/` folder. STIHL (draw 10) broke that assumption: it joined
 * `TOOLSET_LANDING_SLUGS` before its banner art existed, so the old code returned `"Stihl"` and
 * every STIHL visitor fired a 404 per banner before `onError` fell back to Milwaukee. Degraded,
 * but noisily, on a live page — and invisible to `tsc`, because the derived string was cast.
 *
 * An EXPLICIT map means a new toolset defaults to Milwaukee art until someone adds its folder
 * AND its row here. Add the row in the same change as the art, never before.
 *
 * (`Hikoki` was already on disk and already resolving; it was simply missing from the union.)
 */
const BANNER_FOLDER_BY_TOOLSET: Record<string, PromoBannerAssetBrand> = {
  dewalt: "Dewalt",
  hikoki: "Hikoki",
  makita: "Makita",
  milwaukee: "Milwaukee",
  ryobi: "Ryobi",
  // stihl: no promoBanner/Stihl/ art yet — falls back to Milwaukee. Add when it ships.
};

function toolsetSlugToBrandFolder(slug: string): PromoBannerAssetBrand {
  const lower = slug.toLowerCase();
  if (!TOOLSET_SET.has(lower)) return DEFAULT_BRAND;
  return BANNER_FOLDER_BY_TOOLSET[lower] ?? DEFAULT_BRAND;
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
