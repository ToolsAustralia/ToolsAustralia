import assert from "node:assert/strict";
import { upsellPackages } from "@/data/upsellPackages";
import { UPSELL_IMAGE_MANIFEST } from "@/generated/upsellImageManifest";
import { resolveUpsellImage } from "@/utils/upsell/upsell-image-selector";
import { PROMO_MULTIPLIERS } from "@/types/promo-multiplier";

function testManifestSizeStable() {
  assert.equal(UPSELL_IMAGE_MANIFEST.size, 93);
}

function testEveryPackageHasBaseImageOnDisk() {
  for (const pkg of upsellPackages) {
    const key = `${pkg.image.group}/${pkg.image.slug}.webp`;
    assert.ok(
      UPSELL_IMAGE_MANIFEST.has(key),
      `Missing base upsell image for ${pkg.id}: expected manifest key "${key}"`
    );
  }
}

function testResolveForEveryMultiplierCombination() {
  for (const pkg of upsellPackages) {
    for (const m of PROMO_MULTIPLIERS) {
      const r = resolveUpsellImage({ offerId: pkg.id, promoMultiplier: m });
      const pathKey = r.src.replace(/^\/images\/upsells\//, "");
      const ok = UPSELL_IMAGE_MANIFEST.has(pathKey);
      if (r.isPromoVariant) {
        assert.ok(ok, `Promo path should exist: ${pathKey}`);
      } else {
        assert.ok(ok, `Base path should exist when falling back: ${pathKey}`);
      }
    }
  }
}

function run() {
  testManifestSizeStable();
  testEveryPackageHasBaseImageOnDisk();
  testResolveForEveryMultiplierCombination();
  console.log("upsell-image-selector tests passed");
}

run();
