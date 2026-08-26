import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { resolvePromoBannerAssetBrand } from "../resolve-promo-banner-asset-brand";

function testToolsetSlugWins() {
  assert.equal(resolvePromoBannerAssetBrand("makita-milwaukee", "ryobi"), "Ryobi");
  assert.equal(resolvePromoBannerAssetBrand(null, "dewalt"), "Dewalt");
}

function testSlugFirstSegment() {
  assert.equal(resolvePromoBannerAssetBrand("dewalt-milwaukee", null), "Dewalt");
  assert.equal(resolvePromoBannerAssetBrand("makita-sidchrome", null), "Makita");
  assert.equal(resolvePromoBannerAssetBrand("milwaukee-milwaukee", null), "Milwaukee");
}

function testDefaultMilwaukee() {
  assert.equal(resolvePromoBannerAssetBrand(null, null), "Milwaukee");
  assert.equal(resolvePromoBannerAssetBrand("unknown-slug", null), "Milwaukee");
  assert.equal(resolvePromoBannerAssetBrand(null, "not-a-toolset"), "Milwaukee");
}

function run() {
  testToolsetSlugWins();
  testSlugFirstSegment();
  testDefaultMilwaukee();
  console.log("resolvePromoBannerAssetBrand tests passed");
}

run();

// Draw 10: STIHL joined TOOLSET_LANDING_SLUGS before its promoBanner art existed. The old
// capitalise-the-slug mapping returned "Stihl" and fired a 404 per banner on every STIHL page.
// It must fall back to Milwaukee until `promoBanner/Stihl/` ships.
assert.equal(resolvePromoBannerAssetBrand("stihl-gearwrench", "stihl"), "Milwaukee");
assert.equal(resolvePromoBannerAssetBrand(null, "stihl"), "Milwaukee");
assert.equal(resolvePromoBannerAssetBrand("stihl-sidchrome", null), "Milwaukee");

// HiKOKI has had art on disk since draw 9 but was missing from the union — it must resolve to
// its own folder, not the Milwaukee default.
assert.equal(resolvePromoBannerAssetBrand("hikoki-kincrome", "hikoki"), "Hikoki");

// Every folder the resolver can return must exist on disk, or we are back to shipping 404s.
{
  const root = path.join(process.cwd(), "public", "images", "promoBanner");
  for (const slug of ["dewalt", "hikoki", "makita", "milwaukee", "ryobi", "stihl"]) {
    const folder = resolvePromoBannerAssetBrand(null, slug);
    assert.ok(
      fs.existsSync(path.join(root, folder)),
      `${slug} resolves to promoBanner/${folder}/ which does not exist on disk`
    );
  }
}
