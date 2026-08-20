import assert from "node:assert/strict";
import {
  allocateBrandLanes,
  indexToolboxMix,
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

function testAllocationSplitsBareToolsetSpendByObservedMix() {
  // The skew correction. /promotions/ryobi names no toolbox, so its spend is split by the
  // visitor mix that page actually drew rather than piled onto the page default.
  const mix = indexToolboxMix([
    { slug: "ryobi", toolbox: "milwaukee", visitors: 30 },
    { slug: "ryobi", toolbox: "kincrome", visitors: 50 },
    { slug: "ryobi", toolbox: "sidchrome", visitors: 20 },
  ]);

  const { allocations, model } = allocateBrandLanes(`${ORIGIN}/promotions/ryobi`, "toolbox", mix);
  assert.equal(model, "observed-mix");

  const byLane = Object.fromEntries(allocations.map((a) => [a.laneId, a.weight]));
  assert.equal(byLane.kincrome, 0.5);
  assert.equal(byLane.milwaukee, 0.3);
  assert.equal(byLane.sidchrome, 0.2);

  const total = allocations.reduce((t, a) => t + a.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, "weights must sum to 1 — no spend created or lost");
}

function testAllocationFallsBackToPageDefaultWithoutMix() {
  // No visit data for the window (short window, or older than the PromoAnalyticsVisit TTL).
  // Spend must still land somewhere — dropping it would break reconciliation with the ad
  // account — and the model must be reported so the reader knows it is a fallback.
  const { allocations, model } = allocateBrandLanes(`${ORIGIN}/promotions/ryobi`, "toolbox");
  assert.equal(model, "page-default");
  assert.equal(allocations.length, 1);
  assert.equal(allocations[0].weight, 1);
  assert.equal(
    allocations[0].laneId,
    resolveBrandLaneFromBuiltPrize(getPageDefaultPrizeSlug("ryobi"), "toolbox"),
  );

  // An empty/zero-visitor mix must behave identically, not divide by zero.
  const zeroed = indexToolboxMix([{ slug: "ryobi", toolbox: "kincrome", visitors: 0 }]);
  const z = allocateBrandLanes(`${ORIGIN}/promotions/ryobi`, "toolbox", zeroed);
  assert.equal(z.model, "page-default");
  assert.equal(z.allocations.length, 1);
}

function testAllocationIsExactWhereTheUrlNamesTheBrand() {
  const mix = indexToolboxMix([{ slug: "ryobi", toolbox: "kincrome", visitors: 99 }]);

  // An evergreen URL names its own toolbox — the mix must NOT override a stated fact.
  const explicit = allocateBrandLanes(`${ORIGIN}/promotions/ryobi-gearwrench`, "toolbox", mix);
  assert.equal(explicit.model, null, "no modelling when the URL is explicit");
  assert.deepEqual(explicit.allocations, [{ laneId: "gearwrench", weight: 1 }]);

  // The toolset lane is never modelled: every promotion URL names its toolset.
  const toolset = allocateBrandLanes(`${ORIGIN}/promotions/ryobi`, "toolset", mix);
  assert.equal(toolset.model, null);
  assert.deepEqual(toolset.allocations, [{ laneId: "ryobi", weight: 1 }]);
}

function testAllocationDropsNonPromotionUrls() {
  assert.deepEqual(allocateBrandLanes("unknown://meta-ad/1", "toolbox"), {
    allocations: [],
    model: null,
  });
  assert.deepEqual(allocateBrandLanes(`${ORIGIN}/membership`, "toolset"), {
    allocations: [],
    model: null,
  });
  // cash-prize has no toolbox lane — dropped, not bucketed somewhere plausible.
  assert.deepEqual(allocateBrandLanes(`${ORIGIN}/promotions/cash-prize`, "toolbox"), {
    allocations: [],
    model: null,
  });
}

function testMixIsIndexedCaseInsensitively() {
  const mix = indexToolboxMix([{ slug: "RYOBI", toolbox: "kincrome", visitors: 10 }]);
  const { model } = allocateBrandLanes(`${ORIGIN}/promotions/Ryobi`, "toolbox", mix);
  assert.equal(model, "observed-mix", "slug casing must not silently drop to the fallback");
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
  testAllocationSplitsBareToolsetSpendByObservedMix();
  testAllocationFallsBackToPageDefaultWithoutMix();
  testAllocationIsExactWhereTheUrlNamesTheBrand();
  testAllocationDropsNonPromotionUrls();
  testMixIsIndexedCaseInsensitively();
  testSwitchExprMatchesTheFunction();
  console.log("brand-lane tests passed");
}

run();
