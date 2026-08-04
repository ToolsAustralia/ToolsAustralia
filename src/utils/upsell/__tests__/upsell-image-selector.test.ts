import assert from "node:assert/strict";
import { upsellPackages } from "@/data/upsellPackages";
import { UPSELL_IMAGE_MANIFEST } from "@/generated/upsellImageManifest";
import { resolveUpsellImage } from "@/utils/upsell/upsell-image-selector";
import { PROMO_MULTIPLIERS } from "@/types/promo-multiplier";

const ROOT = "/images/upsells";
/**
 * "No artwork" is now `src: null`, not a placeholder path. There is deliberately no
 * `_fallback.webp` on disk: artwork exists only for the multipliers actually in use, and
 * returning a path to a file that isn't there 404s (the optimizer then answers 400 and the
 * modal renders bare alt text). Callers render no image instead.
 */
const NO_ARTWORK = null;

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

    if (r.src === NO_ARTWORK) {
      // Allowed only when the default file genuinely isn't on disk.
      assert.ok(
        !UPSELL_IMAGE_MANIFEST.has(`${pkg.upsellCategory}/${stem}.webp`),
        `${pkg.id} resolved to no artwork but its default image IS on disk`
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
  // An unknown offer yields NO artwork — never a path to a file that isn't there.
  assert.equal(r.src, NO_ARTWORK);
  assert.equal(r.isPromoVariant, false);
}

/**
 * Guard against the exact defect that shipped: a resolved `src` must always name a file the
 * manifest knows about. A path to a missing asset 404s, Next's optimizer answers 400, and the
 * modal renders bare alt text — so "points at nothing" must be `null`, never a string.
 */
function testResolvedSrcAlwaysExists() {
  for (const pkg of upsellPackages) {
    for (const m of [undefined, ...PROMO_MULTIPLIERS]) {
      const r = resolveUpsellImage({ offerId: pkg.id, multiplier: m });
      if (r.src === null) continue;
      const key = r.src.replace(`${ROOT}/`, "");
      assert.ok(
        UPSELL_IMAGE_MANIFEST.has(key),
        `${pkg.id} (multiplier ${String(m)}) resolved to "${r.src}", which is not on disk`
      );
    }
  }
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
  testResolvedSrcAlwaysExists();
  // Was defined but never called, so it had never actually run — registered 2026-08-04.
  testEffectiveMultiplierOutsidePromoListResolves();
  console.log("upsell-image-selector tests passed");
}

run();
