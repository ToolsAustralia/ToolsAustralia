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

// Draw 10: STIHL joined TOOLSET_LANDING_SLUGS one branch BEFORE its promoBanner art existed.
// While that gap was open the resolver deliberately returned Milwaukee, because the old
// capitalise-the-slug mapping returned "Stihl" and fired a 404 per banner on every STIHL page.
// The art landed 2026-08-27, so it now resolves to its own folder — and the disk guard below is
// what makes flipping this row safe to do.
assert.equal(resolvePromoBannerAssetBrand("stihl-gearwrench", "stihl"), "Stihl");
assert.equal(resolvePromoBannerAssetBrand(null, "stihl"), "Stihl");
assert.equal(resolvePromoBannerAssetBrand("stihl-sidchrome", null), "Stihl");

// HiKOKI has had art on disk since draw 9 but was missing from the union — it must resolve to
// its own folder, not the Milwaukee default.
assert.equal(resolvePromoBannerAssetBrand("hikoki-kincrome", "hikoki"), "Hikoki");

// Every brand the resolver can return must have the FULL asset set on disk, or we are back to
// shipping 404s. Checking the folder alone was too weak — `promoBanner/Stihl/` existed as an
// empty directory for a moment before the art was converted into it, and that would have passed.
{
  const root = path.join(process.cwd(), "public", "images", "promoBanner");
  const STATES = [
    ["DrawnTomorrow", "drawn-tomorrow"],
    ["DrawnTonight", "drawn-tonight"],
    ["SpecialPromo", "special-promo"],
  ] as const;
  // 2x is deliberately absent: the README maps unknown/null AND 2 to the 10x art.
  const MULTIPLIERS = [3, 5, 10] as const;
  for (const slug of ["dewalt", "hikoki", "makita", "milwaukee", "ryobi", "stihl"]) {
    const folder = resolvePromoBannerAssetBrand(null, slug);
    for (const [state, stem] of STATES) {
      for (const m of MULTIPLIERS) {
        const rel = path.join(folder, state, `${stem}-${m}x.webp`);
        assert.ok(
          fs.existsSync(path.join(root, rel)),
          `${slug} resolves to promoBanner/${folder}/ but ${rel} is missing on disk`
        );
      }
    }
  }
}
