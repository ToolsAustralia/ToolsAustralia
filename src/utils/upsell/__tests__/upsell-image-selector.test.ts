import assert from "node:assert/strict";
import { upsellPackages } from "@/data/upsellPackages";
import { UPSELL_IMAGE_MANIFEST } from "@/generated/upsellImageManifest";
import { resolveUpsellImage } from "@/utils/upsell/upsell-image-selector";
import { PROMO_MULTIPLIERS } from "@/types/promo-multiplier";

const ROOT = "/images/upsells";
const FALLBACK_SRC = `${ROOT}/_fallback.webp`;

function expectedTier(baseTemplatePackageId: string): string {
  if (/^mini-pack-[123]$/.test(baseTemplatePackageId)) return baseTemplatePackageId;
  return baseTemplatePackageId.replace(/^additional-/, "").replace(/-pack(-mini)?$/, "");
}

/** Mirror of imageStem in upsell-image-selector.ts. */
function expectedStem(category: string, tier: string): string {
  if (category === "additional") return `${tier}-additional`;
  if (category === "mini") return tier.startsWith("mini-pack-") ? tier : `${tier}-mini`;
  return tier;
}

function testEveryPackageResolvesPredictably() {
  for (const pkg of upsellPackages) {
    const r = resolveUpsellImage({ offerId: pkg.id });
    const tier = expectedTier(pkg.baseTemplatePackageId);
    const stem = expectedStem(pkg.upsellCategory, tier);
    const expectedDefault = `${ROOT}/${pkg.upsellCategory}/${stem}.webp`;

    if (r.src === FALLBACK_SRC) {
      // Allowed when the default file isn't on disk yet.
      assert.ok(
        !UPSELL_IMAGE_MANIFEST.has(`${pkg.upsellCategory}/${stem}.webp`),
        `${pkg.id} fell back to global placeholder but its default image IS on disk`
      );
    } else {
      assert.equal(
        r.src,
        expectedDefault,
        `${pkg.id} resolved to "${r.src}" but expected "${expectedDefault}"`
      );
      assert.equal(r.isPromoVariant, false);
    }
  }
}

function testPromoVariantPreferredWhenAvailable() {
  for (const pkg of upsellPackages) {
    const tier = expectedTier(pkg.baseTemplatePackageId);
    const stem = expectedStem(pkg.upsellCategory, tier);
    for (const m of PROMO_MULTIPLIERS) {
      const variantKey = `${pkg.upsellCategory}/${stem}-${m}x.webp`;
      const r = resolveUpsellImage({ offerId: pkg.id, multiplier: m });

      if (UPSELL_IMAGE_MANIFEST.has(variantKey)) {
        assert.equal(r.src, `${ROOT}/${variantKey}`, `Variant should win: ${variantKey}`);
        assert.equal(r.isPromoVariant, true);
      } else {
        // No variant on disk → falls back to default or global placeholder.
        assert.equal(r.isPromoVariant, false);
      }
    }
  }
}

function testUnknownOfferFallsBack() {
  const r = resolveUpsellImage({ offerId: "does-not-exist" });
  assert.equal(r.src, FALLBACK_SRC);
  assert.equal(r.isPromoVariant, false);
}

/**
 * Effective stacked multipliers can be values NOT in PROMO_MULTIPLIERS
 * (one-time 3×2 = 6). The resolver must still pick up the matching file —
 * the manifest is the gate, not the PROMO_MULTIPLIERS allowlist.
 */
function testEffectiveMultiplierOutsidePromoListResolves() {
  if (UPSELL_IMAGE_MANIFEST.has("one-time/tradie-6x.webp")) {
    const r = resolveUpsellImage({ offerId: "onetime-upsell-tradie", multiplier: 6 });
    assert.equal(r.src, `${ROOT}/one-time/tradie-6x.webp`, "6× (3×2) must resolve even though 6 ∉ PROMO_MULTIPLIERS");
    assert.equal(r.isPromoVariant, true);
  }
  // Non-integer / ≤1 multipliers never match a variant.
  const noPromo = resolveUpsellImage({ offerId: "onetime-upsell-tradie", multiplier: 1 });
  assert.equal(noPromo.isPromoVariant, false);
}

function run() {
  testEveryPackageResolvesPredictably();
  testPromoVariantPreferredWhenAvailable();
  testUnknownOfferFallsBack();
  console.log("upsell-image-selector tests passed");
}

run();
