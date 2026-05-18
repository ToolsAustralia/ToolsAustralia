import { getUpsellPackageById } from "@/data/upsellPackages";
import { UPSELL_IMAGE_MANIFEST } from "@/generated/upsellImageManifest";

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
 * Self-describing image filename stem, so assets are unambiguous outside their folder.
 *
 *   membership / one-time : {tier}                  (apprentice, tradie, …)
 *   additional            : {tier}-additional       (tradie-additional, …)
 *   mini  (tier-named)    : {tier}-mini             (tradie-mini, …)
 *   mini  (1/2/3)         : mini-pack-1|2|3         (already self-describing)
 */
function imageStem(
  upsellCategory: "membership" | "one-time" | "additional" | "mini",
  tier: string
): string {
  if (upsellCategory === "additional") return `${tier}-additional`;
  if (upsellCategory === "mini") {
    return tier.startsWith("mini-pack-") ? tier : `${tier}-mini`;
  }
  return tier; // membership, one-time
}

/**
 * Resolve hero image for an upsell offer.
 *
 * Path scheme: {ROOT}/{upsellCategory}/{stem}[-Nx].webp
 * where {stem} is self-describing (see imageStem):
 *   membership/apprentice-50x.webp
 *   one-time/tradie-6x.webp
 *   additional/tradie-additional-20x.webp
 *   mini/tradie-mini.webp   ·   mini/mini-pack-1.webp
 *
 * The `multiplier` arg should be the **effective** value the user will see —
 * typically `activePromoMultiplier × upsellCategoryMultiplier`. This is what
 * the artwork is themed for (e.g., the 50× hero is shown when a 5× promo stacks
 * with a 10× Membership upsell setting), not the raw promo on its own.
 *
 * Fallback chain:
 *   1. {category}/{stem}-{N}x.webp   (variant matching the effective multiplier)
 *   2. {category}/{stem}.webp        (default for this upsell)
 *   3. _fallback.webp                (global placeholder)
 */
export function resolveUpsellImage(params: {
  offerId: string;
  multiplier?: number | null;
}): ResolvedUpsellImage {
  const pkg = getUpsellPackageById(params.offerId);
  if (!pkg) {
    return { src: `${ROOT}/${FALLBACK_PATH}`, isPromoVariant: false };
  }

  const folder = pkg.upsellCategory;
  const tier = deriveTier(pkg.baseTemplatePackageId);
  const stem = imageStem(pkg.upsellCategory, tier);
  const m = params.multiplier;

  // 1. Effective-multiplier variant.
  // The manifest is the gate: effective multipliers (activePromo × categoryMult) can
  // be values outside PROMO_MULTIPLIERS — e.g. one-time 3×2 = 6, additional 3×2 = 6.
  // Accept any positive finite integer and let the on-disk file decide.
  if (m != null && Number.isFinite(m) && m > 1 && Number.isInteger(m)) {
    const variantKey = `${folder}/${stem}-${m}x.webp`;
    if (UPSELL_IMAGE_MANIFEST.has(variantKey)) {
      return { src: `${ROOT}/${variantKey}`, isPromoVariant: true };
    }
  }

  // 2. Default for this upsell
  const defaultKey = `${folder}/${stem}.webp`;
  if (UPSELL_IMAGE_MANIFEST.has(defaultKey)) {
    return { src: `${ROOT}/${defaultKey}`, isPromoVariant: false };
  }

  // 3. Global fallback
  return { src: `${ROOT}/${FALLBACK_PATH}`, isPromoVariant: false };
}
