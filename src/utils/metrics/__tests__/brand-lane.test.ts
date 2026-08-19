import assert from "node:assert/strict";
import {
  resolveBrandLaneFromBuiltPrize,
  resolveBrandLaneFromPromoSlug,
  resolveBrandLaneFromCanonicalUrl,
  brandLaneSwitchExpr,
  BRAND_LANE_PRIZE_SLUGS,
} from "../brand-lane";
import {
  PRIZE_LANE_SLUGS,
  TOOLSET_LANDING_SLUGS,
  TOOLBOX_LANE_ORDER,
  getPageDefaultPrizeSlug,
  getBrandLaneDisplay,
} from "@/config/promo-landing-slugs";

const ORIGIN = "https://toolsaustralia.com.au";

function testBuiltPrizeIsExact() {
  assert.equal(resolveBrandLaneFromBuiltPrize("ryobi-kincrome", "toolset"), "ryobi");
  assert.equal(resolveBrandLaneFromBuiltPrize("ryobi-kincrome", "toolbox"), "kincrome");
  assert.equal(
    resolveBrandLaneFromBuiltPrize("  RYOBI-KINCROME ", "toolbox"),
    "kincrome",
    "runtime values arrive from PaymentEvent.data — case/whitespace must not change the lane",
  );
}

function testCashPrizeIsDroppedNotBucketed() {
  // The cash opt-out has no toolbox lane. Bucketing it anywhere would invent demand for a
  // storage brand nobody chose.
  assert.equal(resolveBrandLaneFromBuiltPrize("cash-prize", "toolbox"), null);
  assert.equal(resolveBrandLaneFromBuiltPrize("cash-prize", "toolset"), null);
  assert.equal(resolveBrandLaneFromPromoSlug("cash-prize", "toolbox"), null);
}

function testBareToolsetPageUsesPageDefaultForToolbox() {
  for (const toolset of TOOLSET_LANDING_SLUGS) {
    assert.equal(
      resolveBrandLaneFromPromoSlug(toolset, "toolset"),
      toolset,
      `bare /promotions/${toolset} names its own toolset`,
    );

    // The toolbox is not in the identifier, so it must come from what the page renders on
    // first paint — the same combination the server records for a visitor who never touched
    // the builder. If these two ever disagree, spend and outcomes land in different rows.
    const expected = resolveBrandLaneFromBuiltPrize(getPageDefaultPrizeSlug(toolset), "toolbox");
    assert.equal(
      resolveBrandLaneFromPromoSlug(toolset, "toolbox"),
      expected,
      `bare /promotions/${toolset} must resolve its toolbox via getPageDefaultPrizeSlug`,
    );
    assert.ok(expected, `${toolset} page default must have a toolbox lane`);
  }
}

function testEvergreenSlugNamesBothLanes() {
  assert.equal(resolveBrandLaneFromPromoSlug("makita-gearwrench", "toolset"), "makita");
  assert.equal(resolveBrandLaneFromPromoSlug("makita-gearwrench", "toolbox"), "gearwrench");
}

function testCanonicalUrlMatchesSlugResolution() {
  // The whole point of the module: spend (URL-keyed) and outcomes (slug-keyed) must bucket
  // identically. Assert it for every registry entry rather than a spot-check.
  for (const { slug } of PRIZE_LANE_SLUGS) {
    for (const lane of ["toolset", "toolbox"] as const) {
      assert.equal(
        resolveBrandLaneFromCanonicalUrl(`${ORIGIN}/promotions/${slug}`, lane),
        resolveBrandLaneFromPromoSlug(slug, lane),
        `URL and slug must agree for ${slug} (${lane})`,
      );
    }
  }
  for (const toolset of TOOLSET_LANDING_SLUGS) {
    for (const lane of ["toolset", "toolbox"] as const) {
      assert.equal(
        resolveBrandLaneFromCanonicalUrl(`${ORIGIN}/promotions/${toolset}`, lane),
        resolveBrandLaneFromPromoSlug(toolset, lane),
        `URL and slug must agree for bare ${toolset} (${lane})`,
      );
    }
  }
}

function testNonPromotionUrlsAreUnattributed() {
  // These become the "Unattributed" footer row rather than vanishing, which is what lets the
  // table's Total still reconcile with the ad account.
  assert.equal(resolveBrandLaneFromCanonicalUrl("unknown://meta-ad/12345", "toolset"), null);
  assert.equal(resolveBrandLaneFromCanonicalUrl(`${ORIGIN}/membership`, "toolset"), null);
  assert.equal(resolveBrandLaneFromCanonicalUrl(`${ORIGIN}`, "toolbox"), null);
  assert.equal(resolveBrandLaneFromCanonicalUrl(`${ORIGIN}/promotions/not-a-brand`, "toolset"), null);
  assert.equal(resolveBrandLaneFromPromoSlug("", "toolset"), null);
}

function testEveryRegistryEntryResolvesBothLanes() {
  assert.equal(
    BRAND_LANE_PRIZE_SLUGS.length,
    PRIZE_LANE_SLUGS.length,
    "the $in guard must cover exactly the registry",
  );
  for (const slug of BRAND_LANE_PRIZE_SLUGS) {
    const toolset = resolveBrandLaneFromBuiltPrize(slug, "toolset");
    const toolbox = resolveBrandLaneFromBuiltPrize(slug, "toolbox");
    assert.ok(toolset && (TOOLSET_LANDING_SLUGS as readonly string[]).includes(toolset), slug);
    assert.ok(toolbox && (TOOLBOX_LANE_ORDER as readonly string[]).includes(toolbox), slug);
  }
}

function testEveryLaneHasDisplay() {
  // A new brand must never render as an unlabelled row. The Record<> types enforce this at
  // compile time; this asserts the runtime lookup agrees and that no wordmark is empty.
  for (const toolset of TOOLSET_LANDING_SLUGS) {
    const d = getBrandLaneDisplay(toolset, "toolset");
    assert.ok(d.label && d.logoPath, `toolset ${toolset} needs a label + wordmark`);
  }
  for (const toolbox of TOOLBOX_LANE_ORDER) {
    const d = getBrandLaneDisplay(toolbox, "toolbox");
    assert.ok(d.label && d.logoPath, `toolbox ${toolbox} needs a label + wordmark`);
  }
  // Milwaukee is genuinely in both lanes — same artwork, different population. This is why the
  // UI must keep the active lane unmistakable.
  assert.equal(
    getBrandLaneDisplay("milwaukee", "toolset").logoPath,
    getBrandLaneDisplay("milwaukee", "toolbox").logoPath,
  );
}

function testSwitchExprMatchesTheFunction() {
  // The Mongo $switch and the JS resolver must agree, or the Page Analytics tab and Brand
  // Performance would bucket the same purchase differently.
  for (const lane of ["toolset", "toolbox"] as const) {
    const expr = brandLaneSwitchExpr("$data.builtPrizeSlug", lane) as {
      $switch: { branches: { case: { $eq: [string, string] }; then: string }[]; default: null };
    };
    assert.equal(expr.$switch.default, null, "unrecognised slugs must resolve to null");
    assert.equal(expr.$switch.branches.length, PRIZE_LANE_SLUGS.length);
    for (const branch of expr.$switch.branches) {
      const slug = branch.case.$eq[1];
      assert.equal(
        branch.then,
        resolveBrandLaneFromBuiltPrize(slug, lane),
        `$switch and resolveBrandLaneFromBuiltPrize disagree for ${slug} (${lane})`,
      );
    }
  }
}

function run() {
  testBuiltPrizeIsExact();
  testCashPrizeIsDroppedNotBucketed();
  testBareToolsetPageUsesPageDefaultForToolbox();
  testEvergreenSlugNamesBothLanes();
  testCanonicalUrlMatchesSlugResolution();
  testNonPromotionUrlsAreUnattributed();
  testEveryRegistryEntryResolvesBothLanes();
  testEveryLaneHasDisplay();
  testSwitchExprMatchesTheFunction();
  console.log("brand-lane tests passed");
}

run();
