import { getUpsellPackageById } from "@/data/upsellPackages";
import { UPSELL_IMAGE_MANIFEST } from "@/generated/upsellImageManifest";
import { isPromoMultiplier } from "@/types/promo-multiplier";

const ROOT = "/images/upsells";
const FALLBACK_PATH = "_fallback.webp";

export interface ResolvedUpsellImage {
  src: string;
  /** True when a promo-specific variant file exists on disk. */
  isPromoVariant: boolean;
}

/**
 * Derive the image filename stem ("tier") from an upsell's `baseTemplatePackageId`.
 *
 * Examples:
 *   apprentice-pack              → apprentice
 *   tradie-pack                  → tradie
 *   additional-boss-pack         → boss
 *   additional-vip-pack-mini     → vip
 *   mini-pack-1 / 2 / 3          → mini-pack-1 / 2 / 3  (kept as-is)
 */
function deriveTier(baseTemplatePackageId: string): string {
  if (/^mini-pack-[123]$/.test(baseTemplatePackageId)) {
    return baseTemplatePackageId;
  }
  return baseTemplatePackageId
    .replace(/^additional-/, "")
    .replace(/-pack(-mini)?$/, "");
}

/**
 * Resolve hero image for an upsell offer.
 *
 * Path scheme: {ROOT}/{upsellCategory}/{tier}[-Nx].webp
 *
 * Fallback chain:
 *   1. {category}/{tier}-{N}x.webp   (promo variant)
 *   2. {category}/{tier}.webp        (default for this upsell)
 *   3. _fallback.webp                (global placeholder)
 */
export function resolveUpsellImage(params: {
  offerId: string;
  promoMultiplier?: number | null;
}): ResolvedUpsellImage {
  const pkg = getUpsellPackageById(params.offerId);
  if (!pkg) {
    return { src: `${ROOT}/${FALLBACK_PATH}`, isPromoVariant: false };
  }

  const folder = pkg.upsellCategory;
  const tier = deriveTier(pkg.baseTemplatePackageId);
  const m = params.promoMultiplier;

  // 1. Promo variant
  if (m != null && isPromoMultiplier(m)) {
    const variantKey = `${folder}/${tier}-${m}x.webp`;
    if (UPSELL_IMAGE_MANIFEST.has(variantKey)) {
      return { src: `${ROOT}/${variantKey}`, isPromoVariant: true };
    }
  }

  // 2. Default for this upsell
  const defaultKey = `${folder}/${tier}.webp`;
  if (UPSELL_IMAGE_MANIFEST.has(defaultKey)) {
    return { src: `${ROOT}/${defaultKey}`, isPromoVariant: false };
  }

  // 3. Global fallback
  return { src: `${ROOT}/${FALLBACK_PATH}`, isPromoVariant: false };
}
