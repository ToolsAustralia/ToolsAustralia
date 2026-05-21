import assert from "node:assert/strict";
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
