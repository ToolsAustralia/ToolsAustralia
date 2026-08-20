import assert from "node:assert/strict";
import {
  buildPeriodComparison,
  inclusiveDayCount,
  perDay,
  rateDelta,
} from "../periodComparisonModel";
import type { AdminDashboardStats } from "@/hooks/queries/useAdminQueries";

/** Minimal stats payload — only the fields the comparison model reads. */
function stats(over: {
  total?: number;
  membershipPurchase?: { revenue: number; purchaseCount: number } | number;
  oneTimePurchase?: { revenue: number; purchaseCount: number } | number;
  additionalOneTimePurchase?: { revenue: number; purchaseCount: number };
  miniDraw?: { revenue: number; purchaseCount: number };
  upsell?: { revenue: number; purchaseCount: number };
  newInRange?: number;
  adSpend?: number;
  adRoas?: number;
}): AdminDashboardStats {
  const item = (v: { revenue: number; purchaseCount: number } | number | undefined) =>
    v ?? { revenue: 0, purchaseCount: 0, userCount: 0 };
  return {
    users: {
      total: 0,
      activeSubscriptions: 0,
      newInRange: over.newInRange ?? 0,
      profileCompletion: 0,
      cancelledMemberships: 0,
      totalScheduledCancellation: 0,
      dropOffRate: 0,
    },
    revenue: {
      total: over.total ?? 0,
      breakdown: {
        subscriptions: 0,
        oneTimePackages: 0,
        membershipPurchase: item(over.membershipPurchase),
        membershipRenewal: item(undefined),
        oneTimePurchase: item(over.oneTimePurchase),
        additionalOneTimePurchase: item(over.additionalOneTimePurchase),
        miniDraw: item(over.miniDraw),
        upsell: item(over.upsell),
      },
    },
    majorDraw: { totalEntries: 0, activeDraws: 0 },
    conversionRate: 0,
    ...(over.adSpend != null || over.adRoas != null
      ? { adTotals: { spend: over.adSpend ?? 0, revenue: 0, roas: over.adRoas ?? 0 } }
      : {}),
  } as AdminDashboardStats;
}

function metric(metrics: ReturnType<typeof buildPeriodComparison>, key: string) {
  const m = metrics.find((x) => x.key === key);
  assert.ok(m, `expected a metric named ${key}`);
  return m;
}

function testDeltaAndPercent() {
  const m = buildPeriodComparison(stats({ total: 1500 }), stats({ total: 1000 }));
  const revenue = metric(m, "revenueTotal");
  assert.equal(revenue.current, 1500);
  assert.equal(revenue.previous, 1000);
  assert.equal(revenue.delta, 500);
  assert.equal(revenue.deltaPct, 50);
}

function testNegativeDelta() {
  const m = buildPeriodComparison(stats({ total: 750 }), stats({ total: 1000 }));
  const revenue = metric(m, "revenueTotal");
  assert.equal(revenue.delta, -250);
  assert.equal(revenue.deltaPct, -25);
}

function testZeroPreviousHasNoPercentage() {
  // A change from nothing has no meaningful percentage — rendering Infinity or a flat 100%
  // would read as a real measurement. null is the signal for the UI to say "new".
  const m = buildPeriodComparison(stats({ total: 500 }), stats({ total: 0 }));
  assert.equal(metric(m, "revenueTotal").deltaPct, null);
  assert.equal(metric(m, "revenueTotal").delta, 500);

  const both = buildPeriodComparison(stats({ total: 0 }), stats({ total: 0 }));
  assert.equal(metric(both, "revenueTotal").deltaPct, null);
  assert.equal(metric(both, "revenueTotal").current, 0);
}

function testPurchasesSumsAllFiveAcquisitionBuckets() {
  const m = buildPeriodComparison(
    stats({
      membershipPurchase: { revenue: 100, purchaseCount: 4 },
      oneTimePurchase: { revenue: 50, purchaseCount: 3 },
      additionalOneTimePurchase: { revenue: 20, purchaseCount: 2 },
      miniDraw: { revenue: 10, purchaseCount: 5 },
      upsell: { revenue: 5, purchaseCount: 1 },
    }),
    stats({}),
  );
  assert.equal(metric(m, "purchases").current, 15, "4+3+2+5+1 — every acquisition bucket");
  assert.equal(metric(m, "newMemberships").current, 4, "memberships only");
}

function testLegacyNumericBreakdownDoesNotThrow() {
  // `RevenueBreakdownItem` is a live union: older payloads carry a bare number. Reading
  // `.purchaseCount` off one would throw or silently produce NaN.
  const m = buildPeriodComparison(
    stats({ membershipPurchase: 250, oneTimePurchase: 100 }),
    stats({}),
  );
  assert.equal(metric(m, "revenueMembershipPurchase").current, 250, "numeric form yields revenue");
  assert.equal(metric(m, "newMemberships").current, 0, "numeric form has no count — 0, not NaN");
  assert.ok(!Number.isNaN(metric(m, "purchases").current));
}

function testMissingPayloadDegradesToZero() {
  // Still loading, or the comparison window errored: contribute zeros rather than throwing,
  // so the card degrades to "no movement" instead of blanking the dashboard.
  const m = buildPeriodComparison(undefined, undefined);
  assert.ok(m.length > 0);
  for (const x of m) {
    assert.equal(x.current, 0, x.key);
    assert.equal(x.previous, 0, x.key);
    assert.equal(x.deltaPct, null, x.key);
  }
}

function testMissingAdTotalsIsZeroNotCrash() {
  const m = buildPeriodComparison(stats({ total: 100 }), stats({ total: 50 }));
  assert.equal(metric(m, "adSpend").current, 0, "no adTotals on the payload");
  assert.equal(metric(m, "adRoas").current, 0);
}

function testAcquisitionRevenueExcludesRenewals() {
  // The whole reason this metric exists rather than reusing revenue.total: ad spend only buys
  // acquisition, so a contribution built on total revenue would credit the budget with renewal
  // income it did not produce.
  const s = stats({
    total: 1000, // includes renewals
    membershipPurchase: { revenue: 200, purchaseCount: 2 },
    oneTimePurchase: { revenue: 100, purchaseCount: 1 },
    additionalOneTimePurchase: { revenue: 50, purchaseCount: 1 },
    miniDraw: { revenue: 30, purchaseCount: 1 },
    upsell: { revenue: 20, purchaseCount: 1 },
    adSpend: 150,
  });
  const m = buildPeriodComparison(s, stats({}));

  assert.equal(metric(m, "revenueTotal").current, 1000, "total still reports everything");
  assert.equal(
    metric(m, "acquisitionRevenue").current,
    400,
    "200+100+50+30+20 — the five acquisition buckets, renewals excluded",
  );
  assert.equal(metric(m, "contribution").current, 250, "400 acquisition − 150 spend");
}

function testContributionCanBeNegative() {
  // Spend outran acquisition. A real reading, not an error — the sign must survive.
  const m = buildPeriodComparison(
    stats({ membershipPurchase: { revenue: 100, purchaseCount: 1 }, adSpend: 400 }),
    stats({ membershipPurchase: { revenue: 100, purchaseCount: 1 }, adSpend: 200 }),
  );
  const c = metric(m, "contribution");
  assert.equal(c.current, -300);
  assert.equal(c.previous, -100);
  assert.equal(c.delta, -200, "getting worse");
  // Percentage uses |previous| as the denominator, so a negative baseline still yields a
  // signed, meaningful figure rather than an inverted one.
  assert.equal(c.deltaPct, -200);
}

function testHeadlineIsASubsetOfAll() {
  const m = buildPeriodComparison(stats({}), stats({}));
  const headline = m.filter((x) => x.headline);
  assert.ok(headline.length > 0 && headline.length < m.length, "the card shows fewer rows than the drawer");
  for (const x of m) {
    assert.ok(["Revenue", "Customers", "Advertising"].includes(x.group), `${x.key} needs a group`);
  }
}

function testInclusiveDayCount() {
  assert.equal(inclusiveDayCount("2026-08-01", "2026-08-31"), 31);
  assert.equal(inclusiveDayCount("2026-08-19", "2026-08-19"), 1, "a single day counts as 1");
  assert.equal(inclusiveDayCount("2026-02-01", "2026-02-28"), 28);
  assert.equal(inclusiveDayCount("2024-02-01", "2024-02-29"), 29, "leap year");
  // Spans a DST transition (AEDT ends first Sunday of April). Calendar arithmetic only, so
  // the 23h/25h day must not shift the count.
  assert.equal(inclusiveDayCount("2026-04-01", "2026-04-30"), 30);
  assert.equal(inclusiveDayCount("", "2026-08-31"), 0, "unresolved bounds yield 0, not NaN");
}

function testDeltaNormalisesAcrossUnequalWindows() {
  // THE BUG THIS PINS (caught on production, 2026-08-20): comparing "Today" against a whole
  // calendar month by raw total measures the calendar, not the business — every flow read
  // ~ -97% because one day is ~3% of thirty-one. Worse, it INVERTED the answer: 197 new
  // accounts today against July's 161.677/day is +22%, rendered as -96.1%.
  const m = buildPeriodComparison(
    stats({ newInRange: 197 }),
    stats({ newInRange: 5012 }),
    { currentDays: 1, previousDays: 31 },
  );
  const accounts = metric(m, "newUsers");

  assert.equal(accounts.normalised, true, "unequal windows must normalise");
  assert.equal(accounts.currentPerDay, 197);
  assert.ok(Math.abs(accounts.previousPerDay! - 161.677) < 0.01);
  assert.ok(accounts.deltaPct! > 0, "197/day vs 161.7/day is an INCREASE, not a 96% collapse");
  assert.ok(Math.abs(accounts.deltaPct! - 21.85) < 0.5, `expected ~+21.9%, got ${accounts.deltaPct}`);

  // Raw totals are still reported unchanged — only the percentage is normalised.
  assert.equal(accounts.current, 197);
  assert.equal(accounts.previous, 5012);
}

function testEqualWindowsCompareRaw() {
  const m = buildPeriodComparison(
    stats({ newInRange: 120 }),
    stats({ newInRange: 100 }),
    { currentDays: 31, previousDays: 31 },
  );
  const a = metric(m, "newUsers");
  assert.equal(a.normalised, false, "same length needs no normalisation");
  assert.equal(a.deltaPct, 20);
}

function testRatiosAndStocksNeverNormalise() {
  const m = buildPeriodComparison(
    stats({ adRoas: 0.7, newInRange: 1 }),
    stats({ adRoas: 0.69, newInRange: 1 }),
    { currentDays: 1, previousDays: 31 },
  );
  // A ratio is already a rate; dividing 0.7 by 1 day and 0.69 by 31 days would invent a 30x swing.
  const roas = metric(m, "adRoas");
  assert.equal(roas.normalised, false);
  assert.equal(roas.currentPerDay, null);
  assert.ok(Math.abs(roas.deltaPct! - 1.449) < 0.01, "compares the ratios directly");

  const active = metric(m, "activeSubscriptions");
  assert.equal(active.normalised, false, "a stock is a level, not a rate");
  assert.equal(active.currentPerDay, null);
}

function testRateDeltaDirectly() {
  assert.deepEqual(rateDelta(10, 5, { currentDays: 1, previousDays: 1, comparable: true }), {
    pct: 100,
    normalised: false,
  });
  // 10/1 vs 310/31 = 10 vs 10 -> no change, even though the raw totals differ 31x.
  assert.deepEqual(rateDelta(10, 310, { currentDays: 1, previousDays: 31, comparable: true }), {
    pct: 0,
    normalised: true,
  });
  assert.deepEqual(rateDelta(10, 310, { currentDays: 1, previousDays: 31, comparable: false }), {
    pct: (10 - 310) / 310 * 100,
    normalised: false,
  });
  assert.equal(rateDelta(10, null, { currentDays: 1, previousDays: 31, comparable: true }), null);
  assert.deepEqual(rateDelta(10, 0, { currentDays: 1, previousDays: 31, comparable: true }), {
    pct: null,
    normalised: true,
  });
  // Unknown window lengths must fall back to a raw comparison, never divide by zero.
  assert.deepEqual(rateDelta(10, 5, { currentDays: 0, previousDays: 0, comparable: true }), {
    pct: 100,
    normalised: false,
  });
}

function testPerDayNormalisation() {
  assert.equal(perDay(3100, 31, "currency"), 100);
  assert.equal(perDay(62, 31, "count"), 2);
  assert.equal(perDay(4.5, 31, "ratio"), null, "a ratio is already a rate — never normalise it");
  assert.equal(perDay(100, 0, "currency"), null, "no divide-by-zero");
  // A STOCK is a level, not an amount accrued over the window. "1 active membership" is not
  // "0.032 active memberships per day" — that rendered on screen before this guard existed.
  assert.equal(perDay(1, 31, "count", true), null, "stocks are never per-day normalised");
}

function testStockMetricsAreFlagged() {
  const m = buildPeriodComparison(stats({}), stats({}));
  const stocks = m.filter((x) => x.stock).map((x) => x.key);
  assert.deepEqual(stocks, ["activeSubscriptions"], "active memberships is the only level metric");
  // Everything else is a flow and MUST stay normalisable, or the per-day column loses its point.
  for (const x of m) {
    if (x.key !== "activeSubscriptions") {
      assert.equal(x.stock, false, `${x.key} should be a flow`);
    }
  }
}

function run() {
  testDeltaAndPercent();
  testNegativeDelta();
  testZeroPreviousHasNoPercentage();
  testPurchasesSumsAllFiveAcquisitionBuckets();
  testLegacyNumericBreakdownDoesNotThrow();
  testMissingPayloadDegradesToZero();
  testMissingAdTotalsIsZeroNotCrash();
  testAcquisitionRevenueExcludesRenewals();
  testContributionCanBeNegative();
  testHeadlineIsASubsetOfAll();
  testInclusiveDayCount();
  testPerDayNormalisation();
  testStockMetricsAreFlagged();
  testDeltaNormalisesAcrossUnequalWindows();
  testEqualWindowsCompareRaw();
  testRatiosAndStocksNeverNormalise();
  testRateDeltaDirectly();
  console.log("periodComparisonModel tests passed");
}

run();
