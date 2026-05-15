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

function testEveryPackageResolvesPredictably() {
  for (const pkg of upsellPackages) {
    const r = resolveUpsellImage({ offerId: pkg.id });
    const tier = expectedTier(pkg.baseTemplatePackageId);
    const expectedDefault = `${ROOT}/${pkg.upsellCategory}/${tier}.webp`;

    if (r.src === FALLBACK_SRC) {
      // Allowed when the default file isn't on disk yet.
      assert.ok(
        !UPSELL_IMAGE_MANIFEST.has(`${pkg.upsellCategory}/${tier}.webp`),
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
    for (const m of PROMO_MULTIPLIERS) {
      const variantKey = `${pkg.upsellCategory}/${tier}-${m}x.webp`;
      const r = resolveUpsellImage({ offerId: pkg.id, promoMultiplier: m });

      if (UPSELL_IMAGE_MANIFEST.has(variantKey)) {
        assert.equal(r.src, `${ROOT}/${variantKey}`, `Promo variant should win: ${variantKey}`);
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

function run() {
  testEveryPackageResolvesPredictably();
  testPromoVariantPreferredWhenAvailable();
  testUnknownOfferFallsBack();
  console.log("upsell-image-selector tests passed");
}

run();
