import { getUpsellPackageById } from "@/data/upsellPackages";
import { UPSELL_IMAGE_MANIFEST } from "@/generated/upsellImageManifest";
import { isPromoMultiplier } from "@/types/promo-multiplier";

const ROOT = "/images/upsells";

export interface ResolvedUpsellImage {
  src: string;
  /** True when a promo-specific variant file exists on disk. */
  isPromoVariant: boolean;
}

/**
 * Resolve hero image for an upsell offer.
 * If `{multiplier}x-{slug}.webp` exists under the package's image group, use it; otherwise use base `{slug}.webp`.
 */
export function resolveUpsellImage(params: {
  offerId: string;
  promoMultiplier?: number | null;
}): ResolvedUpsellImage {
  const pkg = getUpsellPackageById(params.offerId);
  if (!pkg) {
    return { src: `${ROOT}/one-time-pack/tradie-plus.webp`, isPromoVariant: false };
  }

  const { group, slug } = pkg.image;
  const m = params.promoMultiplier;

  if (m != null && isPromoMultiplier(m)) {
    const variantKey = `${group}/${m}x-${slug}.webp`;
    if (UPSELL_IMAGE_MANIFEST.has(variantKey)) {
      return { src: `${ROOT}/${variantKey}`, isPromoVariant: true };
    }
  }

  return { src: `${ROOT}/${group}/${slug}.webp`, isPromoVariant: false };
}
