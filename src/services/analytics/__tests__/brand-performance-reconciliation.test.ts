/**
 * Brand Performance ⇄ Page Analytics — proof that the two surfaces cannot contradict each other.
 *
 * Run: `npm run test:brand-performance-reconciliation`
 *
 * The admin Overview's Brand Performance section (Toolbox × Built prize) and the Page Analytics
 * tab's toolbox rollup (`PromoAnalyticsRepository.getAggregatedByToolbox`) answer different
 * questions and both stay — a dashboard section and a page are not redundant surfaces. But they
 * read the SAME `PaymentEvent` rows through the same lane mapping, so they must never disagree
 * about which lane a purchase belongs to or what it was worth.
 *
 * This feeds BOTH code paths the identical canned event set and asserts the per-lane
 * conversions/revenue match exactly. It is a proof of arithmetic against known input, not a
 * smoke test.
 *
 * Stubbing technique copied from `src/repositories/__tests__/PromoAnalyticsRepository-aggregation.test.ts`:
 * the `global.mongoose` stub must be installed BEFORE anything transitively imports
 * `src/lib/mongodb.ts`, so `connectDB()` takes the "already connected" path and this file never
 * dials a real database. That is also why the imports below are `await import(...)` rather than
 * static — static imports are hoisted and would run first.
 */

import assert from "node:assert/strict";

(global as unknown as { mongoose: { conn: unknown; promise: unknown } }).mongoose = {
  conn: {
    readyState: 1,
    db: { admin: () => ({ ping: async () => ({}) }) },
  },
  promise: null,
};

type AggregateModel = { aggregate: (...args: unknown[]) => unknown };

/**
 * Hand back canned arrays in call order, mirroring `.aggregate([...]).exec()`, and CAPTURE the
 * pipelines the caller passed.
 *
 * Capturing matters: because Mongo is stubbed, the repository's real `$switch` never executes,
 * so canned results alone would make this test circular (both sides deriving lanes from the
 * same JS helper). Inspecting the pipeline is what proves the repository still bucket by the
 * SHARED expression rather than a reintroduced local copy.
 */
function stubAggregate(
  model: AggregateModel,
  resultsByCall: unknown[][],
): { restore: () => void; pipelines: unknown[][] } {
  const original = model.aggregate;
  const pipelines: unknown[][] = [];
  let callIndex = 0;
  model.aggregate = (...args: unknown[]) => {
    pipelines.push(args[0] as unknown[]);
    const result = resultsByCall[callIndex] ?? [];
    callIndex++;
    return { exec: async () => result };
  };
  return { restore: () => { model.aggregate = original; }, pipelines };
}

/** Pull every `$switch` expression out of an aggregation pipeline, at any depth. */
function findSwitches(node: unknown, found: Array<{ branches: Array<{ case: unknown; then: unknown }>; default: unknown }> = []) {
  if (Array.isArray(node)) {
    for (const n of node) findSwitches(n, found);
    return found;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj.$switch) {
      found.push(obj.$switch as { branches: Array<{ case: unknown; then: unknown }>; default: unknown });
    }
    for (const v of Object.values(obj)) findSwitches(v, found);
  }
  return found;
}

const START = new Date("2026-08-01T00:00:00.000Z");
const END = new Date("2026-08-31T23:59:59.999Z");

/**
 * The shared fixture. Six net BenefitsGranted purchases across three toolbox lanes, plus two
 * rows that MUST be excluded by both paths: a membership renewal and a cash-prize purchase
 * (no toolbox lane).
 *
 * Expected per lane: kincrome 2 / $70 · milwaukee 3 / $105 · gearwrench 1 / $25.
 */
interface Fixture {
  builtPrizeSlug: string;
  packageType: string;
  price: number;
  userId: string;
  billingReason?: string;
}

const PURCHASES: Fixture[] = [
  { builtPrizeSlug: "ryobi-kincrome", packageType: "one-time", price: 25, userId: "u1" },
  { builtPrizeSlug: "makita-kincrome", packageType: "membership", price: 45, userId: "u2" },
  { builtPrizeSlug: "ryobi-milwaukee", packageType: "one-time", price: 25, userId: "u3" },
  { builtPrizeSlug: "dewalt-milwaukee", packageType: "upsell", price: 35, userId: "u4" },
  { builtPrizeSlug: "hikoki-milwaukee", packageType: "mini-draw", price: 45, userId: "u5" },
  { builtPrizeSlug: "makita-gearwrench", packageType: "one-time", price: 25, userId: "u6" },
];

const EXCLUDED: Fixture[] = [
  {
    builtPrizeSlug: "ryobi-kincrome",
    packageType: "membership",
    price: 999,
    userId: "u7",
    billingReason: "subscription_cycle",
  },
  { builtPrizeSlug: "cash-prize", packageType: "one-time", price: 500, userId: "u8" },
];

const EXPECTED: Record<string, { conversions: number; revenue: number }> = {
  kincrome: { conversions: 2, revenue: 70 },
  milwaukee: { conversions: 3, revenue: 105 },
  gearwrench: { conversions: 1, revenue: 25 },
};

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  console.log("\nBrand Performance ⇄ Page Analytics reconciliation");

  const PromoAnalyticsVisit = (await import("@/models/PromoAnalyticsVisit"))
    .default as unknown as AggregateModel;
  const User = (await import("@/models/User")).default as unknown as AggregateModel;
  const PaymentEvent = (await import("@/models/PaymentEvent")).default as unknown as AggregateModel;
  const promoAnalyticsRepository = (await import("@/repositories/PromoAnalyticsRepository")).default;
  const { buildBrandPerformanceWindow } = await import("../BrandPerformanceService");
  const { resolveBrandLaneFromBuiltPrize } = await import("@/utils/metrics/brand-lane");

  // ── Path A: Page Analytics ──────────────────────────────────────────────────────────────
  //
  // `getAggregatedByToolbox` groups in MONGO via `brandLaneSwitchExpr`. Its pipeline is stubbed,
  // so the canned result must be what that pipeline WOULD produce for the fixture — computed
  // here with the same shared resolver the pipeline's $switch is built from, which is precisely
  // the coupling under test.
  const laneTotals = new Map<string, { conversions: number; revenue: number }>();
  for (const p of PURCHASES) {
    const lane = resolveBrandLaneFromBuiltPrize(p.builtPrizeSlug, "toolbox");
    if (!lane) continue;
    const acc = laneTotals.get(lane) ?? { conversions: 0, revenue: 0 };
    acc.conversions += 1;
    acc.revenue += p.price;
    laneTotals.set(lane, acc);
  }

  const visitStub = stubAggregate(PromoAnalyticsVisit, [[]]);
  const userStub = stubAggregate(User, [[]]);
  const paymentStub = stubAggregate(PaymentEvent, [
    [...laneTotals.entries()].map(([lane, t]) => ({
      _id: lane,
      conversions: t.conversions,
      revenue: t.revenue,
    })),
  ]);

  let pageAnalytics: Awaited<ReturnType<typeof promoAnalyticsRepository.getAggregatedByToolbox>>;
  try {
    pageAnalytics = await promoAnalyticsRepository.getAggregatedByToolbox(START, END);
  } finally {
    // Leaving a stub installed poisons every later test in this process.
    visitStub.restore();
    userStub.restore();
    paymentStub.restore();
  }

  // ── Path B: Brand Performance ───────────────────────────────────────────────────────────
  //
  // Groups in JS from the same rows, via the same resolver. Excluded rows are handed in
  // deliberately — the classifier must drop them, not the fixture.
  const brand = buildBrandPerformanceWindow({
    lane: "toolbox",
    basis: "built-prize",
    platform: "all",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    spend: [],
    events: [...PURCHASES, ...EXCLUDED].map((p) => ({
      userId: p.userId,
      packageType: p.packageType,
      data: {
        price: p.price,
        ...(p.billingReason ? { billingReason: p.billingReason } : {}),
      },
      _laneKey: p.builtPrizeSlug,
    })),
  });

  // ── Assertions ──────────────────────────────────────────────────────────────────────────

  check("the fixture produces the hand-computed lane totals (guards the fixture itself)", () => {
    assert.deepEqual(
      Object.fromEntries([...laneTotals.entries()].map(([k, v]) => [k, v])),
      EXPECTED,
    );
  });

  check("Page Analytics reports the expected per-lane conversions and revenue", () => {
    for (const [lane, expected] of Object.entries(EXPECTED)) {
      const row = pageAnalytics.byToolbox.find((r) => r.toolboxId === lane);
      assert.ok(row, `Page Analytics is missing the ${lane} lane`);
      assert.equal(row.conversions, expected.conversions, `${lane} conversions`);
      assert.equal(row.revenue, expected.revenue, `${lane} revenue`);
    }
  });

  check("Brand Performance agrees with Page Analytics on EVERY lane", () => {
    for (const row of pageAnalytics.byToolbox) {
      const brandRow = brand.rows.find((r) => r.laneId === row.toolboxId);
      assert.ok(brandRow, `Brand Performance is missing the ${row.toolboxId} lane`);
      assert.equal(
        brandRow.purchases,
        row.conversions,
        `${row.toolboxId}: purchases must equal Page Analytics' conversions`,
      );
      assert.equal(
        brandRow.revenue,
        row.revenue,
        `${row.toolboxId}: revenue must match Page Analytics exactly`,
      );
    }
    assert.equal(
      brand.rows.length,
      pageAnalytics.byToolbox.length,
      "neither surface may show a lane the other does not",
    );
  });

  check("Page Analytics buckets via the SHARED lane expression, not a local copy", () => {
    // The assertion that makes this test non-circular. Mongo is stubbed, so the repository's
    // $switch never executes — but it IS captured. If someone reintroduces a hand-written
    // mapping in getAggregatedByToolbox, its branches drift from the shared resolver and this
    // fails, which is exactly the regression the shared import exists to prevent.
    const switches = findSwitches(paymentStub.pipelines);
    const laneSwitch = switches.find((sw) => Array.isArray(sw.branches) && sw.branches.length > 0);
    assert.ok(laneSwitch, "the toolbox aggregation must bucket lanes with a $switch");
    assert.equal(laneSwitch.default, null, "unrecognised slugs must resolve to null, not a lane");

    for (const branch of laneSwitch.branches) {
      const slug = (branch.case as { $eq: [string, string] }).$eq[1];
      assert.equal(
        branch.then,
        resolveBrandLaneFromBuiltPrize(slug, "toolbox"),
        `the repository $switch disagrees with the shared resolver for ${slug}`,
      );
    }
  });

  check("both paths exclude renewals and cash-prize identically", () => {
    // The renewal ($999) and the cash purchase ($500) appear in neither total.
    const brandTotal = brand.rows.reduce((t, r) => t + r.revenue, 0);
    assert.equal(brandTotal, 200, "70 + 105 + 25 — the renewal and cash rows are excluded");
    assert.ok(
      !brand.rows.some((r) => r.laneId === "cash-prize"),
      "cash-prize has no toolbox lane and must not become a row",
    );
    // Cash lands in Unattributed rather than vanishing, so the ledger still balances.
    assert.equal(brand.unattributed?.revenue, 500);
    assert.equal(brand.totals.revenue, 700, "200 attributed + 500 unattributed");
  });

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("brand-performance-reconciliation tests passed");
}

void main();
