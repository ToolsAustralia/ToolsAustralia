import assert from "node:assert/strict";
import {
  buildBrandPerformanceWindow,
  zeroBrandRow,
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

function testToolboxLaneUsesPageDefaultForBareToolsetSpend() {
  // /promotions/ryobi has no toolbox in the URL; its spend must land on the page default's
  // toolbox — the same lane the server records for a visitor who never touched the builder.
  const result = build({
    lane: "toolbox",
    basis: "built-prize",
    spend: [spend("meta", [[`${ORIGIN}/promotions/ryobi`, 10_000]])],
    events: [ev("ryobi-kincrome", "one-time", 100)],
  });

  // Spend lands on the default toolbox, revenue on the one actually built — that divergence
  // is the whole point of the built-prize basis.
  const kincrome = rowFor(result, "kincrome");
  assert.equal(kincrome.revenue, 100);
  assert.equal(kincrome.spend, 0);

  const milwaukee = rowFor(result, "milwaukee");
  assert.equal(milwaukee.spend, 100, "bare-toolset spend attributes to the page default toolbox");
  assert.equal(result.totals.spend, 100, "totals still reconcile");
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
  testToolboxLaneUsesPageDefaultForBareToolsetSpend();
  testCashPrizeIsDroppedIntoUnattributed();
  testTotalUserCountIsDistinctAcrossLanes();
  testZeroBrandRowShape();
  console.log("brand-performance tests passed");
}

run();
