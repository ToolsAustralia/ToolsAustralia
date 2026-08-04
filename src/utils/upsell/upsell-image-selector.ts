import { getUpsellPackageById } from "@/data/upsellPackages";
import { UPSELL_IMAGE_MANIFEST } from "@/generated/upsellImageManifest";

const ROOT = "/images/upsells";

export interface ResolvedUpsellImage {
  /**
   * Absolute path to real artwork, or NULL when none exists for this offer.
   *
   * Deliberately nullable rather than pointing at a placeholder file. Artwork only exists for
   * the multipliers actually in use (membership runs at 5x/10x; the rest are follow-ups), so a
   * "global fallback" either 404s — which is exactly what shipped: the request 404'd, Next's
   * image optimizer answered 400, and the modal rendered bare alt text — or stands in for art
   * that was never meant to exist.
   *
   * Callers MUST render no image when this is null. An offer with no artwork is a normal
   * state, not an error.
   */
  src: string | null;
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
 *   3. null                          (no artwork — the caller renders no image)
 */
export function resolveUpsellImage(params: {
  offerId: string;
  multiplier?: number | null;
}): ResolvedUpsellImage {
  const pkg = getUpsellPackageById(params.offerId);
  if (!pkg) {
    return { src: null, isPromoVariant: false };
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

  // 3. No artwork for this offer — render nothing rather than a stand-in.
  return { src: null, isPromoVariant: false };
}
