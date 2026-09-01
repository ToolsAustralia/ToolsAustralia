import assert from "node:assert/strict";
import {
  buildBrandPerformanceWindow,
  zeroBrandRow,
  type BrandAdUrlCheckSource,
  type BrandOutcomeEvent,
  type BrandSpendSource,
} from "../BrandPerformanceService";

const ORIGIN = "https://toolsaustralia.com.au";
const START = "2026-08-01";
const END = "2026-08-31";

function spend(
  platform: "meta" | "tiktok",
  rows: Array<[url: string, spendCents: number, revenueCents?: number, conversions?: number]>,
): BrandSpendSource {
  return {
    platform,
    rows: rows.map(([canonicalUrl, spendCents, revenueCents = 0, conversions = 0]) => ({
      canonicalUrl,
      spendCents,
      revenueCents,
      conversions,
    })),
  };
}

/** A net BenefitsGranted row as the service projects it. */
function ev(
  laneKey: string,
  packageType: string,
  price: number,
  extra: { billingReason?: string; packageId?: string; userId?: string } = {},
): BrandOutcomeEvent {
  return {
    userId: extra.userId ?? "u1",
    packageType,
    packageId: extra.packageId,
    data: { price, ...(extra.billingReason ? { billingReason: extra.billingReason } : {}) },
    _laneKey: laneKey,
  };
}

const base = {
  platform: "all" as const,
  startDate: START,
  endDate: END,
};

function build(over: Partial<Parameters<typeof buildBrandPerformanceWindow>[0]>) {
  return buildBrandPerformanceWindow({
    ...base,
    lane: "toolset",
    basis: "landing-page",
    spend: [],
    events: [],
    ...over,
  });
}

/**
 * Ad rows for the ad-URL check roll-up, in the shape `getAdUrlCheckRows` returns them.
 * `rawUrls` is what the check reads — the canonical form has the query stripped off it.
 */
function ads(
  platform: "meta" | "tiktok",
  rows: Array<{
    adId: string;
    campaignName?: string;
    adName?: string;
    canonicalUrl?: string;
    rawUrls?: string[];
    spendCents?: number;
  }>,
): BrandAdUrlCheckSource {
  return {
    platform,
    ads: rows.map((r) => ({ ...r, spendCents: r.spendCents ?? 0 })),
  };
}

function rowFor(result: ReturnType<typeof build>, laneId: string) {
  const r = result.rows.find((x) => x.laneId === laneId);
  assert.ok(r, `expected a row for ${laneId}`);
  return r;
}

function testRoasIsRecomputedFromTotalsNotAveraged() {
  // Two brands with wildly different scale. Averaging their ROAS gives (10 + 1)/2 = 5.5;
  // the correct total is 11000/2000 = 5.5... so pick numbers where the two DIFFER.
  // ryobi: spend 100, revenue 1000 -> 10x.  makita: spend 900, revenue 900 -> 1x.
  // average = 5.5x, true total = 1900/1000 = 1.9x.
  const result = build({
    spend: [spend("meta", [[`${ORIGIN}/promotions/ryobi`, 10_000], [`${ORIGIN}/promotions/makita`, 90_000]])],
    events: [ev("ryobi", "one-time", 1000), ev("makita", "one-time", 900)],
  });

  assert.equal(rowFor(result, "ryobi").roas, 10);
  assert.equal(rowFor(result, "makita").roas, 1);
  assert.equal(
    result.totals.roas,
    1.9,
    "total ROAS must be summed revenue / summed spend (1900/1000), never the mean of row ROAS (5.5)",
  );
}

function testRenewalsAreExcluded() {
  // Master spec §3.1.2: renewals are identified by billingReason, NOT the isRenewal flag.
  const result = build({
    events: [
      ev("ryobi", "membership", 20),
      ev("ryobi", "membership", 20, { billingReason: "subscription_cycle" }),
    ],
  });

  const row = rowFor(result, "ryobi");
  assert.equal(row.purchases, 1, "the renewal must not count as a purchase");
  assert.equal(row.revenue, 20, "the renewal's revenue must not be included");
  assert.equal(row.newMemberships, 1);
}

function testAcquisitionCategoriesAllCountAsPurchases() {
  // "Purchases" is every acquisition type: membership, one-time, additional one-time,
  // mini-draw and upsell — not just memberships.
  const result = build({
    events: [
      ev("ryobi", "membership", 20),
      ev("ryobi", "one-time", 25),
      ev("ryobi", "one-time", 15, { packageId: "additional-5" }),
      ev("ryobi", "mini-draw", 10),
      ev("ryobi", "upsell", 5),
    ],
  });

  const row = rowFor(result, "ryobi");
  assert.equal(row.purchases, 5);
  assert.equal(row.revenue, 75);
  assert.equal(row.newMemberships, 1);
  assert.equal(row.newMembershipRevenue, 20);

  const byCat = Object.fromEntries(row.byCategory.map((c) => [c.category, c.purchaseCount]));
  assert.deepEqual(byCat, {
    "membership-purchase": 1,
    "one-time-purchase": 1,
    "additional-one-time": 1,
    "mini-draw": 1,
    upsell: 1,
  });
}

function testNewMembershipPercentages() {
  const result = build({
    events: [ev("ryobi", "membership", 60), ev("ryobi", "one-time", 40)],
  });
  const row = rowFor(result, "ryobi");
  assert.equal(row.newMembershipCountPct, 50, "1 of 2 purchases");
  assert.equal(row.newMembershipRevenuePct, 60, "60 of 100 dollars");
}

function testZeroDenominatorsAreZeroNotNaN() {
  // Spend with no outcomes at all: the row must still render, with 0s rather than NaN.
  const result = build({
    spend: [spend("meta", [[`${ORIGIN}/promotions/ryobi`, 5000]])],
  });
  const row = rowFor(result, "ryobi");
  assert.equal(row.roas, 0);
  assert.equal(row.newMembershipCountPct, 0);
  assert.equal(row.newMembershipRevenuePct, 0);
  assert.ok(!Number.isNaN(row.newMembershipCountPct!));
  assert.ok(!Number.isNaN(row.newMembershipRevenuePct!));
}

function testUnattributedKeepsTotalsReconciled() {
  const result = build({
    spend: [
      spend("meta", [
        [`${ORIGIN}/promotions/ryobi`, 10_000],
        ["unknown://meta-ad/999", 4_000], // destination unresolved
        [`${ORIGIN}/membership`, 1_000], // not a promotion page
      ]),
    ],
    events: [ev("ryobi", "one-time", 100), ev("", "one-time", 50)], // second has no attribution
  });

  assert.equal(result.rows.length, 1, "only real brands become rows");
  assert.ok(result.unattributed, "unresolvable spend/outcomes must surface, not vanish");
  assert.equal(result.unattributed!.spend, 50, "40 + 10 dollars of unattributable spend");
  assert.equal(result.unattributed!.revenue, 50);

  assert.equal(result.totals.spend, 150, "Total must include the unattributed bucket");
  assert.equal(result.totals.revenue, 150);
  assert.equal(result.totals.purchases, 2);
}

function testPlatformBasisUsesPlatformRevenueAndHasNoMembershipSplit() {
  const result = build({
    basis: "platform",
    spend: [spend("meta", [[`${ORIGIN}/promotions/ryobi`, 10_000, 50_000, 7]])],
    // Server events must be IGNORED under this basis, even if handed in.
    events: [ev("ryobi", "membership", 999)],
  });

  const row = rowFor(result, "ryobi");
  assert.equal(row.revenue, 500, "revenue comes from the platform's revenueCents");
  assert.equal(row.purchases, 7, "purchases come from the platform's conversions");
  assert.equal(row.roas, 5);
  assert.equal(row.newMemberships, null, "platform data has no membership split — null, not 0");
  assert.equal(row.newMembershipCountPct, null);
  assert.deepEqual(row.byCategory, []);
}

function testPlatformAllSumsSpendButFlagsBlendedRevenue() {
  const result = build({
    basis: "platform",
    spend: [
      spend("meta", [[`${ORIGIN}/promotions/ryobi`, 10_000, 30_000, 3]]),
      spend("tiktok", [[`${ORIGIN}/promotions/ryobi`, 5_000, 20_000, 2]]),
    ],
  });

  const row = rowFor(result, "ryobi");
  assert.equal(row.spend, 150, "spend IS additive across platforms");
  assert.deepEqual(row.platforms.sort(), ["meta", "tiktok"]);
  assert.equal(
    result.meta.blendedPlatformRevenue,
    true,
    "two platforms reporting their own revenue must be flagged as double-countable",
  );
}

function testServerBasisAcrossPlatformsIsNotBlended() {
  // Our own ledger is read once, so combining platforms only combines SPEND — no double count.
  const result = build({
    basis: "landing-page",
    spend: [
      spend("meta", [[`${ORIGIN}/promotions/ryobi`, 10_000, 30_000, 3]]),
      spend("tiktok", [[`${ORIGIN}/promotions/ryobi`, 5_000, 20_000, 2]]),
    ],
    events: [ev("ryobi", "one-time", 100)],
  });

  assert.equal(result.meta.blendedPlatformRevenue, false);
  assert.equal(rowFor(result, "ryobi").revenue, 100, "server revenue, not the platforms' claims");
}

function testToolboxLaneFallsBackToPageDefaultWithoutMix() {
  // No visit data for the window (older than the PromoAnalyticsVisit TTL, say). Spend must
  // still land somewhere and the response must SAY it used the fallback model.
  const result = build({
    lane: "toolbox",
    basis: "built-prize",
    spend: [spend("meta", [[`${ORIGIN}/promotions/ryobi`, 10_000]])],
    events: [ev("ryobi-kincrome", "one-time", 100)],
  });

  assert.equal(result.meta.toolboxSpendModel, "page-default");
  assert.equal(result.meta.toolboxMixVisitors, null, "no sample when nothing was modelled from visits");

  const kincrome = rowFor(result, "kincrome");
  assert.equal(kincrome.revenue, 100, "revenue follows the combination actually built");
  assert.equal(kincrome.spend, 0);

  const milwaukee = rowFor(result, "milwaukee");
  assert.equal(milwaukee.spend, 100, "fallback pins bare-toolset spend to the page default");
  assert.equal(result.totals.spend, 100, "totals still reconcile");
}

function testToolboxSpendIsSplitByObservedMix() {
  // THE SKEW CORRECTION. Without it, all $100 of /promotions/ryobi spend lands on Milwaukee
  // (the page default) and the Milwaukee row measures the default rather than the market.
  const result = build({
    lane: "toolbox",
    basis: "built-prize",
    spend: [spend("meta", [[`${ORIGIN}/promotions/ryobi`, 10_000]])],
    events: [],
    toolboxMix: [
      { slug: "ryobi", toolbox: "kincrome", visitors: 60 },
      { slug: "ryobi", toolbox: "milwaukee", visitors: 30 },
      { slug: "ryobi", toolbox: "sidchrome", visitors: 10 },
    ],
  });

  assert.equal(result.meta.toolboxSpendModel, "observed-mix");
  assert.equal(result.meta.toolboxMixVisitors, 100, "the sample behind the split must be reported");
  assert.equal(rowFor(result, "kincrome").spend, 60);
  assert.equal(rowFor(result, "milwaukee").spend, 30);
  assert.equal(rowFor(result, "sidchrome").spend, 10);
  assert.equal(result.totals.spend, 100, "the split conserves spend exactly");
}

function testPlatformBasisSplitsRevenueWithSpend() {
  // Platform revenue and conversions are URL-keyed too, so they take the SAME split — dividing
  // a modelled spend by an unmodelled revenue would produce a nonsense ROAS.
  const result = build({
    lane: "toolbox",
    basis: "platform",
    spend: [spend("meta", [[`${ORIGIN}/promotions/ryobi`, 10_000, 40_000, 10]])],
    toolboxMix: [
      { slug: "ryobi", toolbox: "kincrome", visitors: 75 },
      { slug: "ryobi", toolbox: "milwaukee", visitors: 25 },
    ],
  });

  const kincrome = rowFor(result, "kincrome");
  assert.equal(kincrome.spend, 75);
  assert.equal(kincrome.revenue, 300);
  assert.equal(kincrome.purchases, 7.5, "conversions split with the rest; the UI rounds on render");
  assert.equal(kincrome.roas, 4, "ROAS survives the split — 300/75 == 400/100");
  assert.equal(rowFor(result, "milwaukee").roas, 4, "…and is identical on the other share");
  assert.equal(result.totals.revenue, 400);
}

function testSpendAndRevenueAreKeyedTheSameWay() {
  // THE BUG THIS PINS (caught on production data, 2026-08-20): the toolbox mix was applied to
  // SPEND under every basis, while revenue under landing-page is keyed on promotionSlug — which
  // resolves a bare toolset page to its DEFAULT toolbox. So one toolbox collected the spend and
  // another collected the revenue, and every per-row ROAS in that view was meaningless.
  //
  // The service only passes `toolboxMix` for basis=built-prize. This asserts the builder honours
  // an empty mix by falling back to the page default, so both sides key alike.
  const spendRows = [spend("meta", [[`${ORIGIN}/promotions/ryobi`, 10_000]])];
  const revenue = [ev("ryobi", "one-time", 100)]; // promotionSlug = bare toolset page

  const landingPage = build({
    lane: "toolbox",
    basis: "landing-page",
    spend: spendRows,
    events: revenue,
    toolboxMix: [], // what the service supplies for this basis
  });

  const pageDefault = "milwaukee"; // getDefaultPrizeForToolsetSlug prefers the Milwaukee toolbox
  const row = rowFor(landingPage, pageDefault);
  assert.equal(row.spend, 100, "all bare-toolset spend lands on the page default");
  assert.equal(row.revenue, 100, "...and so does its revenue");
  assert.equal(row.roas, 1, "so ROAS is meaningful — same key on both sides");
  assert.equal(
    landingPage.rows.length,
    1,
    "no second toolbox row holding spend with no revenue (or vice versa)",
  );
  assert.equal(landingPage.meta.toolboxSpendModel, "page-default");
}

function testToolsetLaneIsNeverModelled() {
  const result = build({
    lane: "toolset",
    spend: [spend("meta", [[`${ORIGIN}/promotions/ryobi`, 10_000]])],
    toolboxMix: [{ slug: "ryobi", toolbox: "kincrome", visitors: 99 }],
  });
  assert.equal(result.meta.toolboxSpendModel, null, "every promotion URL names its toolset");
  assert.equal(rowFor(result, "ryobi").spend, 100);
}

function testMixedModelIsReported() {
  // One page has visit data, another does not. The reader must be told the table blends both.
  const result = build({
    lane: "toolbox",
    spend: [
      spend("meta", [
        [`${ORIGIN}/promotions/ryobi`, 10_000],
        [`${ORIGIN}/promotions/makita`, 10_000],
      ]),
    ],
    toolboxMix: [{ slug: "ryobi", toolbox: "kincrome", visitors: 5 }],
  });
  assert.equal(result.meta.toolboxSpendModel, "mixed");
  assert.equal(result.totals.spend, 200, "both pages' spend is still counted in full");
}

function testCashPrizeIsDroppedIntoUnattributed() {
  const result = build({
    lane: "toolbox",
    basis: "built-prize",
    events: [ev("cash-prize", "one-time", 100)],
  });
  assert.equal(result.rows.length, 0, "cash has no toolbox lane");
  assert.equal(result.unattributed?.revenue, 100, "and is surfaced, not silently dropped");
}

function testTotalUserCountIsDistinctAcrossLanes() {
  // The same buyer purchasing under two brands must count ONCE in the total's userCount.
  const result = build({
    events: [
      ev("ryobi", "one-time", 50, { userId: "shared" }),
      ev("makita", "one-time", 50, { userId: "shared" }),
    ],
  });
  const oneTime = result.totals.byCategory.find((c) => c.category === "one-time-purchase");
  assert.equal(oneTime?.purchaseCount, 2, "purchases are additive");
  assert.equal(oneTime?.userCount, 1, "buyers are distinct — summing per-lane counts would say 2");
}

/**
 * The production case this roll-up exists for: "Draw 10 | Sales | STIHL | Sep 2026" spending
 * against `/promotions/makita`. On the table it was invisible — it just made Makita's ROAS look
 * bad — and the only way to see it was to open Makita's per-ad modal and read campaign names.
 */
function testMismatchedAdBadgesTheBrandRowItSpendsIn() {
  const result = build({
    spend: [spend("meta", [[`${ORIGIN}/promotions/makita`, 33_000]])],
    adChecks: [
      ads("meta", [
        {
          adId: "1",
          campaignName: "Draw 10 | Sales | STIHL | Sep 2026",
          canonicalUrl: `${ORIGIN}/promotions/makita`,
          rawUrls: [`${ORIGIN}/promotions/makita`],
          spendCents: 15_700,
        },
        {
          adId: "2",
          campaignName: "Draw 10 | Sales | Makita | Sep 2026",
          canonicalUrl: `${ORIGIN}/promotions/makita`,
          rawUrls: [`${ORIGIN}/promotions/makita`],
          spendCents: 17_300,
        },
      ]),
    ],
  });

  const issues = rowFor(result, "makita").adUrlIssues;
  assert.ok(issues, "a brand row with a wrong-brand ad must carry adUrlIssues");
  assert.equal(issues.mismatchAdCount, 1);
  assert.equal(issues.checkedAdCount, 2, "the clean ad is the denominator, not a finding");
  assert.deepEqual(issues.mismatchBrands, ["stihl"], "the badge must name the brand the ad is FOR");
  assert.equal(
    issues.mismatchSpend,
    157,
    "spend must be the mismatched ad's alone, in AUD — the reader compares it to the Spend cell",
  );
  assert.equal(issues.unrecognisedParamAdCount, 0);
}

/** A clean brand renders nothing at all — no badge, and no all-clear either. */
function testCleanBrandHasNoIssuesObject() {
  const result = build({
    spend: [spend("meta", [[`${ORIGIN}/promotions/ryobi`, 10_000]])],
    adChecks: [
      ads("meta", [
        {
          adId: "1",
          campaignName: "Draw 10 | Sales | Ryobi | Sep 2026",
          canonicalUrl: `${ORIGIN}/promotions/ryobi`,
          rawUrls: [`${ORIGIN}/promotions/ryobi?toolbox=kincrome`],
          spendCents: 10_000,
        },
      ]),
    ],
  });

  assert.equal(
    rowFor(result, "ryobi").adUrlIssues,
    undefined,
    "a clean row must omit adUrlIssues entirely — a zeroed object would render a badge-shaped nothing",
  );
}

/**
 * The dangerous case. An ad with no resolved destination cannot be checked, so the row must
 * look exactly like a clean one: silent. Reporting "0 problems" here would be an assurance the
 * check never established.
 */
function testUncheckableAdsProduceNoIssuesAndNoFalseClean() {
  const result = build({
    spend: [spend("meta", [[`${ORIGIN}/promotions/dewalt`, 5_000]])],
    adChecks: [
      ads("meta", [
        // No destination doc at all: the sync writes an unknown:// placeholder and no rawUrls.
        { adId: "1", campaignName: "Draw 10 | Sales | STIHL | Sep 2026", spendCents: 5_000 },
        // A destination that resolves no recognised brand — checkable, but says nothing.
        {
          adId: "2",
          campaignName: "Draw 10 | Sales | STIHL | Sep 2026",
          canonicalUrl: "unknown://meta-ad/2",
          rawUrls: ["unknown://meta-ad/2"],
          spendCents: 0,
        },
      ]),
    ],
  });

  assert.equal(
    rowFor(result, "dewalt").adUrlIssues,
    undefined,
    "an unverifiable ad is neither a finding nor an all-clear",
  );
}

/**
 * A typo'd `?toolbox=` is a SEPARATE defect from a wrong-brand ad — different fix, different
 * icon — so it must be able to badge a row whose brand check is otherwise perfectly clean.
 */
function testTypoedParamBadgesIndependentlyOfBrandMismatch() {
  const result = build({
    spend: [spend("meta", [[`${ORIGIN}/promotions/makita`, 20_000]])],
    adChecks: [
      ads("meta", [
        {
          adId: "1",
          campaignName: "Draw 10 | Sales | Makita | Sep 2026",
          canonicalUrl: `${ORIGIN}/promotions/makita`,
          rawUrls: [`${ORIGIN}/promotions/makita?toolbox=milwakee`],
          spendCents: 20_000,
        },
      ]),
    ],
  });

  const issues = rowFor(result, "makita").adUrlIssues;
  assert.ok(issues, "a typo'd param alone must still badge the row");
  assert.equal(issues.mismatchAdCount, 0, "the brand check is clean and must stay clean");
  assert.equal(issues.mismatchSpend, 0);
  assert.equal(issues.unrecognisedParamAdCount, 1);
  assert.deepEqual(issues.unrecognisedValues, ["milwakee"]);
}

/**
 * Under the toolbox lane a bare toolset page's spend splits across rows. Counts must NOT be
 * split with it — there is no such thing as 0.4 of a wrong-brand ad, and the drill-down would
 * show the whole ad — but the SPEND figure must be, or it would not reconcile with the Spend
 * cell printed beside it.
 */
function testToolboxLaneWeightsSpendButNotAdCounts() {
  const result = build({
    lane: "toolbox",
    basis: "built-prize",
    spend: [spend("meta", [[`${ORIGIN}/promotions/makita`, 40_000]])],
    toolboxMix: [
      { slug: "makita", toolbox: "kincrome", visitors: 3 },
      { slug: "makita", toolbox: "sidchrome", visitors: 1 },
    ],
    adChecks: [
      ads("meta", [
        {
          adId: "1",
          campaignName: "Draw 10 | Sales | STIHL | Sep 2026",
          canonicalUrl: `${ORIGIN}/promotions/makita`,
          rawUrls: [`${ORIGIN}/promotions/makita`],
          spendCents: 40_000,
        },
      ]),
    ],
  });

  const kincrome = rowFor(result, "kincrome").adUrlIssues;
  const sidchrome = rowFor(result, "sidchrome").adUrlIssues;
  assert.ok(kincrome && sidchrome, "both lanes carrying the ad's spend must carry its finding");
  assert.equal(kincrome.mismatchAdCount, 1, "counted whole in each lane it touches");
  assert.equal(sidchrome.mismatchAdCount, 1);
  assert.equal(kincrome.mismatchSpend, 300, "3/4 of $400");
  assert.equal(sidchrome.mismatchSpend, 100, "1/4 of $400");
}

/** No ad data supplied at all (e.g. the platform read failed) degrades to silence, not zeros. */
function testMissingAdChecksLeaveEveryRowSilent() {
  const result = build({
    spend: [spend("meta", [[`${ORIGIN}/promotions/ryobi`, 10_000]])],
  });
  assert.equal(rowFor(result, "ryobi").adUrlIssues, undefined);
}

function testZeroBrandRowShape() {
  const server = zeroBrandRow("ryobi", "toolset", "landing-page");
  assert.equal(server.spend, 0);
  assert.equal(server.newMemberships, 0, "server bases report a real zero");
  assert.equal(server.displayName, "Ryobi");

  const platform = zeroBrandRow("ryobi", "toolset", "platform");
  assert.equal(platform.newMemberships, null, "platform basis stays null, not 0");
}

function run() {
  testRoasIsRecomputedFromTotalsNotAveraged();
  testRenewalsAreExcluded();
  testAcquisitionCategoriesAllCountAsPurchases();
  testNewMembershipPercentages();
  testZeroDenominatorsAreZeroNotNaN();
  testUnattributedKeepsTotalsReconciled();
  testPlatformBasisUsesPlatformRevenueAndHasNoMembershipSplit();
  testPlatformAllSumsSpendButFlagsBlendedRevenue();
  testServerBasisAcrossPlatformsIsNotBlended();
  testToolboxLaneFallsBackToPageDefaultWithoutMix();
  testToolboxSpendIsSplitByObservedMix();
  testPlatformBasisSplitsRevenueWithSpend();
  testSpendAndRevenueAreKeyedTheSameWay();
  testToolsetLaneIsNeverModelled();
  testMixedModelIsReported();
  testCashPrizeIsDroppedIntoUnattributed();
  testTotalUserCountIsDistinctAcrossLanes();
  testZeroBrandRowShape();
  testMismatchedAdBadgesTheBrandRowItSpendsIn();
  testCleanBrandHasNoIssuesObject();
  testUncheckableAdsProduceNoIssuesAndNoFalseClean();
  testTypoedParamBadgesIndependentlyOfBrandMismatch();
  testToolboxLaneWeightsSpendButNotAdCounts();
  testMissingAdChecksLeaveEveryRowSilent();
  console.log("brand-performance tests passed");
}

run();
