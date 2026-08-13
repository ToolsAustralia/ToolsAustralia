/**
 * PromoAnalyticsRepository — proof of arithmetic for the admin revenue aggregations.
 *
 * Run: `npm run test:promo-analytics-aggregation`
 *
 * F-002 (panel review, docs/tech-debt/panel-review-feature-drawn-tonight-tomorrow-july-assets.md):
 * the `buildDistribution` merge/sort inside `getAggregatedByPage`, and ALL of
 * `getAggregatedByBuiltPrize`, were verified only by throwaway probe scripts during
 * implementation — those files no longer exist. This logic feeds the admin dashboard AND the
 * Norm external API. A regression such as flipping the tie-break comparator, or changing a
 * `builders > 0` guard to `>= 0` (turning `0/0` into `Infinity`), would misreport revenue
 * attribution with nothing in CI to catch it.
 *
 * This is a proof of arithmetic, not a smoke test: every assertion below hard-codes the
 * expected number and is checked against KNOWN, canned aggregation input — it does not merely
 * execute the code, it proves known inputs produce mathematically correct outputs.
 */

import assert from "node:assert/strict";

/**
 * Mirrors src/utils/promo-analytics/__tests__/record-prize-build.test.ts:30-36 exactly, and for
 * the same reason: connectDB() (src/lib/mongodb.ts) reads a module-scoped `cached` variable that
 * is bound to `global.mongoose` on THAT module's own first evaluation. This stub must exist
 * before anything below (transitively) imports src/lib/mongodb.ts for the first time, so it
 * takes the fast "already connected" path and this file never dials out to a real database.
 * That is also why the repository/model imports below are `await import(...)` rather than
 * static top-of-file imports — static imports are hoisted and would run before this stub does.
 */
(global as unknown as { mongoose: { conn: unknown; promise: unknown } }).mongoose = {
  conn: {
    readyState: 1,
    db: { admin: () => ({ ping: async () => ({}) }) },
  },
  promise: null,
};

let failures = 0;
function run(name: string, fn: () => void | Promise<void>) {
  const done = (error?: unknown) => {
    if (error) {
      failures++;
      console.error(`  ✗ ${name}`);
      console.error(`    ${error instanceof Error ? error.message : String(error)}`);
    } else {
      console.log(`  ✓ ${name}`);
    }
  };
  try {
    const result = fn();
    if (result instanceof Promise) return result.then(() => done()).catch(done);
    done();
  } catch (error) {
    done(error);
  }
  return Promise.resolve();
}

type AggregateModel = { aggregate: (...args: unknown[]) => unknown };

/**
 * Replaces `model.aggregate` with a stub that hands back the next array in `resultsByCall`,
 * consumed IN CALL ORDER — both repository methods under test call `.aggregate()` more than
 * once per model in a single run (e.g. `getAggregatedByPage` hits `PromoAnalyticsVisit` three
 * times in a row: visits, builds-by-combination, builds-by-page). Mirrors `.aggregate([...]).exec()`, the exact
 * call shape both methods use.
 *
 * Returns a restore function. Callers MUST call it in a `finally` — leaving a stub installed
 * poisons every later test in this process, same footgun called out in record-prize-build.test.ts.
 */
function stubAggregate(model: AggregateModel, resultsByCall: unknown[][]): () => void {
  const original = model.aggregate;
  let callIndex = 0;
  model.aggregate = () => {
    const result = resultsByCall[callIndex] ?? [];
    callIndex++;
    return { exec: async () => result };
  };
  return () => {
    model.aggregate = original;
  };
}

const START = new Date("2026-01-01T00:00:00.000Z");
const END = new Date("2026-12-31T23:59:59.999Z");

async function main() {
  console.log("\nPromoAnalyticsRepository aggregation — proof of arithmetic");

  const PromoAnalyticsVisit = (await import("@/models/PromoAnalyticsVisit")).default as unknown as AggregateModel;
  const User = (await import("@/models/User")).default as unknown as AggregateModel;
  const PaymentEvent = (await import("@/models/PaymentEvent")).default as unknown as AggregateModel;
  const promoAnalyticsRepository = (await import("@/repositories/PromoAnalyticsRepository")).default;

  // ============================================================================================
  // getAggregatedByPage — buildDistribution merge/sort (F-002 case 1-4)
  // ============================================================================================

  await run(
    "getAggregatedByPage: two builtPrizeSlug rows on the SAME page both survive the merge, each keeping its own visitor count",
    async () => {
      const restoreVisit = stubAggregate(PromoAnalyticsVisit, [
        [], // 1. visitAgg
        [
          // 2. buildByComboAgg — two different combinations on the same "milwaukee" toolset page
          {
            _id: { pageType: "toolset", slug: "milwaukee", builtPrizeSlug: "milwaukee-kincrome" },
            builders: 3,
            interactedBuilders: 3,
          },
          {
            _id: { pageType: "toolset", slug: "milwaukee", builtPrizeSlug: "milwaukee-sidchrome" },
            builders: 2,
            interactedBuilders: 2,
          },
        ],
        [
          // 3. buildByPageAgg — the SAME five visitors, deduped once across the page
          { _id: { pageType: "toolset", slug: "milwaukee" }, buildVisitors: 5, builds: 5 },
        ],
      ]);
      const restoreUser = stubAggregate(User, [[]]);
      const restorePayment = stubAggregate(PaymentEvent, [[]]);
      try {
        const summary = await promoAnalyticsRepository.getAggregatedByPage(START, END);
        const page = summary.byPage.find((p) => p.pageType === "toolset" && p.slug === "milwaukee");
        if (!page) throw new Error("the milwaukee toolset page must be present in byPage");

        assert.equal(
          page.buildDistribution.length,
          2,
          "both built combinations must land in buildDistribution — a merge bug keyed only on the page (dropping the builtPrizeSlug dimension) would silently collapse one combination into the other"
        );
        assert.deepEqual(
          page.buildDistribution,
          [
            { builtPrizeSlug: "milwaukee-kincrome", visitors: 3 },
            { builtPrizeSlug: "milwaukee-sidchrome", visitors: 2 },
          ],
          "each combination must keep its OWN visitor count — an overwrite bug (map.set instead of push/accumulate) would show only the last-seen combination and silently discard the first"
        );
        assert.equal(
          page.buildVisitors,
          5,
          "builds must be the union of visitor ids across every combination on this page (3 + 2 = 5 distinct visitors) — this is the denominator 'Switched away %' divides by"
        );
      } finally {
        restoreVisit();
        restoreUser();
        restorePayment();
      }
    }
  );

  await run(
    "getAggregatedByPage: an equal-visitors tie sorts buildDistribution by builtPrizeSlug ASCENDING",
    async () => {
      const restoreVisit = stubAggregate(PromoAnalyticsVisit, [
        [],
        [
          { _id: { pageType: "toolset", slug: "ryobi", builtPrizeSlug: "ryobi-sidchrome" }, builders: 2, interactedBuilders: 2 },
          { _id: { pageType: "toolset", slug: "ryobi", builtPrizeSlug: "ryobi-kincrome" }, builders: 2, interactedBuilders: 2 },
        ],
        [{ _id: { pageType: "toolset", slug: "ryobi" }, buildVisitors: 4, builds: 4 }],
      ]);
      const restoreUser = stubAggregate(User, [[]]);
      const restorePayment = stubAggregate(PaymentEvent, [[]]);
      try {
        const summary = await promoAnalyticsRepository.getAggregatedByPage(START, END);
        const page = summary.byPage.find((p) => p.pageType === "toolset" && p.slug === "ryobi");
        if (!page) throw new Error("the ryobi toolset page must be present in byPage");

        assert.deepEqual(
          page.buildDistribution.map((d) => d.builtPrizeSlug),
          ["ryobi-kincrome", "ryobi-sidchrome"],
          "on an exact tie (2 visitors each) the order must be deterministic — sorted by builtPrizeSlug ascending. A flipped or missing tie-break makes the admin's build breakdown flap between reloads with no underlying data change"
        );
      } finally {
        restoreVisit();
        restoreUser();
        restorePayment();
      }
    }
  );

  await run(
    "getAggregatedByPage: topBuiltPrize is ALWAYS buildDistribution[0] — single source of truth, even on a tie",
    async () => {
      const restoreVisit = stubAggregate(PromoAnalyticsVisit, [
        [],
        [
          { _id: { pageType: "toolset", slug: "ryobi", builtPrizeSlug: "ryobi-sidchrome" }, builders: 2, interactedBuilders: 2 },
          { _id: { pageType: "toolset", slug: "ryobi", builtPrizeSlug: "ryobi-kincrome" }, builders: 2, interactedBuilders: 2 },
        ],
        [{ _id: { pageType: "toolset", slug: "ryobi" }, buildVisitors: 4, builds: 4 }],
      ]);
      const restoreUser = stubAggregate(User, [[]]);
      const restorePayment = stubAggregate(PaymentEvent, [[]]);
      try {
        const summary = await promoAnalyticsRepository.getAggregatedByPage(START, END);
        const page = summary.byPage.find((p) => p.pageType === "toolset" && p.slug === "ryobi");
        if (!page) throw new Error("the ryobi toolset page must be present in byPage");

        assert.equal(
          page.topBuiltPrize,
          page.buildDistribution[0].builtPrizeSlug,
          "topBuiltPrize must be DERIVED from buildDistribution[0], never computed independently — two separate computations that usually happen to agree is exactly how a dashboard headline value silently disagrees with its own breakdown table"
        );
      } finally {
        restoreVisit();
        restoreUser();
        restorePayment();
      }
    }
  );

  await run(
    "getAggregatedByPage: a page with no build rows reports builds:0, buildDistribution:[], topBuiltPrize:null — never undefined",
    async () => {
      const restoreVisit = stubAggregate(PromoAnalyticsVisit, [
        [],
        [],
        [
          // builds exist for a DIFFERENT page only — "dewalt" never appears here
          { _id: { pageType: "toolset", slug: "ryobi", builtPrizeSlug: "ryobi-kincrome" }, visitorIds: ["u1"] },
        ],
      ]);
      const restoreUser = stubAggregate(User, [[]]);
      const restorePayment = stubAggregate(PaymentEvent, [[]]);
      try {
        const summary = await promoAnalyticsRepository.getAggregatedByPage(START, END);
        const page = summary.byPage.find((p) => p.pageType === "toolset" && p.slug === "dewalt");
        if (!page) {
          throw new Error(
            "the dewalt toolset page must be present in byPage — it's a real TOOLSET_LANDING_SLUGS entry, present even with zero builds"
          );
        }

        assert.equal(page.builds, 0, "a page nobody built anything on must report builds:0, not undefined");
        assert.deepEqual(
          page.buildDistribution,
          [],
          "buildDistribution must be an empty array, not undefined — a consumer doing buildDistribution[0] without a length check would throw on THIS shape alone"
        );
        assert.equal(
          page.topBuiltPrize,
          null,
          "topBuiltPrize must be exactly null, not undefined or an empty string — the admin UI's null-check for 'nobody built here yet' depends on this exact value"
        );
      } finally {
        restoreVisit();
        restoreUser();
        restorePayment();
      }
    }
  );

  // ============================================================================================
  // getAggregatedByBuiltPrize — the zero-builders guard, exact arithmetic, final sort (case 5-7)
  // ============================================================================================

  await run(
    "getAggregatedByBuiltPrize: a slug with signups but ZERO builders reports builders:0 and every builder-denominated rate:0 — never NaN or Infinity (the exact F-002 regression)",
    async () => {
      const restoreVisit = stubAggregate(PromoAnalyticsVisit, [
        [{ _id: "milwaukee-kincrome", builders: 5 }], // buildAgg — "makita-kincrome" is deliberately ABSENT
      ]);
      const restoreUser = stubAggregate(User, [
        [
          { _id: "milwaukee-kincrome", signups: 2 },
          { _id: "makita-kincrome", signups: 3 }, // signed up, but never built — no build row above
        ],
      ]);
      const restorePayment = stubAggregate(PaymentEvent, [[]]);
      try {
        const summary = await promoAnalyticsRepository.getAggregatedByBuiltPrize(START, END);
        const row = summary.byBuiltPrize.find((r) => r.builtPrizeSlug === "makita-kincrome");
        if (!row) {
          throw new Error(
            "makita-kincrome must still appear — the merge is a union of every slug seen ANYWHERE (builders/signups/conversions), not just slugs with a build row"
          );
        }

        assert.equal(
          row.builders,
          0,
          "builders must be exactly 0 when the slug has no build row, never undefined — this is the denominator every rate below divides by"
        );
        assert.equal(
          row.builderToSignupRate,
          0,
          "builderToSignupRate must be 0 when builders is 0: changing the `builders > 0` guard to `builders >= 0` turns this into 0/0*100 = NaN (or Infinity for a nonzero numerator) — either would silently misreport revenue attribution on the admin dashboard AND the Norm external feed"
        );
        assert.equal(
          row.overallConversionRate,
          0,
          "overallConversionRate shares the SAME `builders > 0` guard — it must independently be 0, not just builderToSignupRate, or a partial fix to one rate would leave the other broken"
        );
        assert.ok(
          Number.isFinite(row.builderToSignupRate) && Number.isFinite(row.overallConversionRate),
          "both rates must be finite numbers — an Infinity or NaN reaching JSON.stringify() for the admin/Norm response would corrupt the payload, not just display a wrong number"
        );
      } finally {
        restoreVisit();
        restoreUser();
        restorePayment();
      }
    }
  );

  await run(
    "getAggregatedByBuiltPrize: exact arithmetic — builders:10, signups:4, conversions:2 must give exactly 40 / 50 / 20",
    async () => {
      const restoreVisit = stubAggregate(PromoAnalyticsVisit, [[{ _id: "dewalt-milwaukee", builders: 10 }]]);
      const restoreUser = stubAggregate(User, [[{ _id: "dewalt-milwaukee", signups: 4 }]]);
      const restorePayment = stubAggregate(PaymentEvent, [
        [{ _id: "dewalt-milwaukee", conversions: 2, revenue: 500 }],
      ]);
      try {
        const summary = await promoAnalyticsRepository.getAggregatedByBuiltPrize(START, END);
        const row = summary.byBuiltPrize.find((r) => r.builtPrizeSlug === "dewalt-milwaukee");
        if (!row) throw new Error("dewalt-milwaukee must appear in byBuiltPrize");

        // Pass-through fields, unchanged by any rate math.
        assert.equal(row.builders, 10);
        assert.equal(row.signups, 4);
        assert.equal(row.conversions, 2);
        assert.equal(row.revenue, 500);

        // Hard-coded expected numbers — NOT recomputed here, so a wrong formula fails THIS
        // assertion rather than a tautology that would pass no matter what the code does.
        assert.equal(
          row.builderToSignupRate,
          40,
          "builderToSignupRate = signups/builders*100 = 4/10*100 = 40"
        );
        assert.equal(
          row.signupToConversionRate,
          50,
          "signupToConversionRate = conversions/signups*100 = 2/4*100 = 50"
        );
        assert.equal(
          row.overallConversionRate,
          20,
          "overallConversionRate = conversions/builders*100 = 2/10*100 = 20 — NOT conversions/signups (a common copy-paste mistake between the two rate columns, which would give 50 instead of 20)"
        );
      } finally {
        restoreVisit();
        restoreUser();
        restorePayment();
      }
    }
  );

  await run(
    "getAggregatedByBuiltPrize: chosenRate = interactedBuilders/builders*100, and a 0-builders row is 0 not NaN",
    async () => {
      const restoreVisit = stubAggregate(PromoAnalyticsVisit, [
        [
          // The whole point of the column: near-identical exposure, opposite preference. This
          // mirrors real production data — milwaukee-kincrome was chosen by 48.9% on
          // /promotions/milwaukee but 2.0% on /promotions/milwaukee-kincrome, where it is the
          // page default. Ranking on `builders` alone cannot tell these two apart.
          { _id: "dewalt-kincrome", builders: 200, interactedBuilders: 150 },
          { _id: "milwaukee-milwaukee", builders: 200, interactedBuilders: 4 },
          // Built by nobody in-window, but converted — exercises the divide-by-zero guard.
          { _id: "hikoki-gearwrench", builders: 0, interactedBuilders: 0 },
        ],
      ]);
      const restoreUser = stubAggregate(User, [[]]);
      const restorePayment = stubAggregate(PaymentEvent, [
        [{ _id: "hikoki-gearwrench", conversions: 1, revenue: 20 }],
      ]);
      try {
        const summary = await promoAnalyticsRepository.getAggregatedByBuiltPrize(START, END);
        const byslug = (s: string) => {
          const row = summary.byBuiltPrize.find((r) => r.builtPrizeSlug === s);
          if (!row) throw new Error(`${s} must appear in byBuiltPrize`);
          return row;
        };

        // Hard-coded, not recomputed — a wrong formula must fail HERE, not tautologically pass.
        assert.equal(byslug("dewalt-kincrome").interactedBuilders, 150);
        assert.equal(
          byslug("dewalt-kincrome").chosenRate,
          75,
          "chosenRate = interactedBuilders/builders*100 = 150/200*100 = 75"
        );
        assert.equal(
          byslug("milwaukee-milwaukee").chosenRate,
          2,
          "same 200 builders, 4/200*100 = 2 — identical exposure, 37.5x apart on preference. If chosenRate were ever computed against a different denominator (e.g. total builders across all rows) these two would stop being comparable, which is the ONLY thing this column is for."
        );

        // The F-002 guard, extended to the new rate: 0 builders must give 0, never NaN.
        const zero = byslug("hikoki-gearwrench");
        assert.equal(zero.builders, 0);
        assert.equal(zero.interactedBuilders, 0);
        assert.equal(
          zero.chosenRate,
          0,
          "chosenRate must be 0 when builders is 0 — 0/0*100 is NaN, which renders as 'NaN%' in the admin table and fails the Norm response schema's z.number() at runtime (a 500 tsc cannot catch)"
        );

        // Bounds: this is a subset over its own population, so it can never exceed 100%. Both
        // operands come from ONE aggregation scan specifically so this stays true — the 250%
        // switched-away column (F-013) came from dividing two separately-scanned populations.
        for (const row of summary.byBuiltPrize) {
          assert.ok(
            row.chosenRate >= 0 && row.chosenRate <= 100,
            `chosenRate out of bounds for ${row.builtPrizeSlug}: ${row.chosenRate}`
          );
          assert.ok(
            row.interactedBuilders <= row.builders,
            `interactedBuilders (${row.interactedBuilders}) must never exceed builders (${row.builders}) for ${row.builtPrizeSlug}`
          );
        }
      } finally {
        restoreVisit();
        restoreUser();
        restorePayment();
      }
    }
  );

  await run(
    "getAggregatedByBuiltPrize: final order is builders DESCENDING, builtPrizeSlug ASCENDING as tie-break",
    async () => {
      const restoreVisit = stubAggregate(PromoAnalyticsVisit, [
        [
          { _id: "makita-kincrome", builders: 5 },
          { _id: "hikoki-kincrome", builders: 8 },
          { _id: "dewalt-kincrome", builders: 8 }, // ties with hikoki-kincrome — "dewalt" < "hikoki"
          { _id: "ryobi-kincrome", builders: 2 },
        ],
      ]);
      const restoreUser = stubAggregate(User, [[]]);
      const restorePayment = stubAggregate(PaymentEvent, [[]]);
      try {
        const summary = await promoAnalyticsRepository.getAggregatedByBuiltPrize(START, END);
        assert.deepEqual(
          summary.byBuiltPrize.map((r) => r.builtPrizeSlug),
          ["dewalt-kincrome", "hikoki-kincrome", "makita-kincrome", "ryobi-kincrome"],
          "builders must sort descending (8, 8, 5, 2), with the 8-builder tie broken by builtPrizeSlug ascending ('dewalt' before 'hikoki') — an admin scanning top-to-bottom for the best-converting combination relies on this order being deterministic, not insertion order from the aggregation pipeline"
        );
      } finally {
        restoreVisit();
        restoreUser();
        restorePayment();
      }
    }
  );

  console.log(failures === 0 ? "\nAll passed\n" : `\n${failures} failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
