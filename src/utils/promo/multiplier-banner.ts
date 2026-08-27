/**
 * Multiplier banner paths under `public/images/banners/multiplier`.
 * Generic (root) art when no toolset brand is active; branded subfolders when it is.
 */

import { isToolsetLandingSlug, type ToolsetLandingSlug } from "@/config/promo-landing-slugs";

const BANNER_BASE_PATH = "/images/banners/multiplier";

/**
 * Toolsets that actually have a branded multiplier-banner folder on disk.
 *
 * Being a landing slug is NOT enough. `getMultiplierBannerImagePaths` returns
 * `[branded, generic]` as an ordered `src` + `onError` chain, so a brand with no folder still
 * renders — but only after the browser takes a **400 from `/_next/image`** on every banner load.
 *
 * That had already been happening for HiKOKI since draw 9: it joined `TOOLSET_LANDING_SLUGS`
 * without banner art, and the old code returned it unconditionally. STIHL would have repeated it.
 * Gating on real art makes both fall straight to the generic banner with no failed request.
 *
 * Add a brand here in the SAME change that adds `public/images/banners/multiplier/<brand>/`.
 */
const BRANDS_WITH_BANNER_ART = new Set<ToolsetLandingSlug>(["dewalt", "makita", "milwaukee", "ryobi"]);

/**
 * Same toolset detection as static promo banner brand folders, but **no default brand**:
 * `null` means use generic (unbranded) multiplier art.
 */
export function resolveMultiplierBannerBrandFolder(
  slug: string | null | undefined,
  toolsetSlug: string | null | undefined
): ToolsetLandingSlug | null {
  const candidate = (() => {
    if (toolsetSlug && isToolsetLandingSlug(toolsetSlug)) return toolsetSlug;
    if (slug) {
      const first = slug.split("-")[0]?.toLowerCase();
      if (first && isToolsetLandingSlug(first)) return first as ToolsetLandingSlug;
    }
    return null;
  })();

  return candidate && BRANDS_WITH_BANNER_ART.has(candidate) ? candidate : null;
}

/**
 * Unbranded banner (root) — fallback when no brand theme is active, or as second choice after branded.
 */
export function getGenericMultiplierBannerPath(multiplier: number | null | undefined): string | null {
  if (!multiplier || multiplier <= 1) {
    return null;
  }

  switch (multiplier) {
    case 2:
    case 3:
    case 5:
    case 10:
    case 12:
    case 15:
    case 20:
      return `${BANNER_BASE_PATH}/${multiplier}x-banner.webp`;
    default:
      return null;
  }
}

export function getBrandedMultiplierBannerPath(multiplier: number, brand: ToolsetLandingSlug): string {
  return `${BANNER_BASE_PATH}/${brand}/${multiplier}x-banner-${brand}.webp`;
}

/**
 * Ordered URLs: branded first when a toolset/theme is active, then generic.
 */
export function getMultiplierBannerImagePaths(
  multiplier: number | null | undefined,
  slug: string | null | undefined,
  toolsetSlug: string | null | undefined
): string[] {
  const generic = getGenericMultiplierBannerPath(multiplier);
  if (!generic || multiplier == null) {
    return [];
  }

  const brand = resolveMultiplierBannerBrandFolder(slug ?? null, toolsetSlug ?? null);
  if (!brand) {
    return [generic];
  }

  return [getBrandedMultiplierBannerPath(multiplier, brand), generic];
}

/**
 * Primary generic path (backward compatible name).
 */
export function getMultiplierBannerPath(multiplier: number | null | undefined): string | null {
  return getGenericMultiplierBannerPath(multiplier);
}

export function hasMultiplierBanner(multiplier: number | null | undefined): boolean {
  return getGenericMultiplierBannerPath(multiplier) !== null;
}

export const BANNER_DIMENSIONS = {
  width: 800,
  height: 200,
  aspectRatio: 4,
} as const;
