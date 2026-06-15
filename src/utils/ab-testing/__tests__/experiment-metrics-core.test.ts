import assert from "node:assert/strict";
import {
  computeExperimentMetrics,
  percentile,
  type AssignmentRow,
  type PaymentRow,
} from "../experiment-metrics-core";

const BASE = new Date("2026-06-01T00:00:00Z").getTime();
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** A date `days` after the fixed base (no clock dependency). */
const d = (days: number) => new Date(BASE + days * MS_PER_DAY);

function assign(variantId: string, who: { userId?: string; anonymousId?: string }, days = 0): AssignmentRow {
  return { variantId, userId: who.userId ?? null, anonymousId: who.anonymousId ?? null, assignedAt: d(days) };
}
function granted(
  userId: string,
  priceDollars: number,
  days: number,
  opts: { variantId?: string | null; isRenewal?: boolean; pi?: string } = {}
): PaymentRow {
  return {
    paymentIntentId: opts.pi ?? `pi_${userId}_${days}`,
    userId,
    variantId: opts.variantId ?? null,
    eventType: "BenefitsGranted",
    priceDollars,
    refundAmountCents: null,
    isRenewal: opts.isRenewal ?? false,
    timestamp: d(days),
  };
}
function refund(pi: string, kind: "RefundProcessed" | "RefundPartial", refundAmountCents = 0): PaymentRow {
  return {
    paymentIntentId: pi,
    userId: "refunder",
    variantId: null,
    eventType: kind,
    priceDollars: null,
    refundAmountCents,
    isRenewal: false,
    timestamp: d(1),
  };
}
const approx = (a: number, b: number, msg: string) =>
  assert.ok(Math.abs(a - b) < 1e-6, `${msg}: expected ${b}, got ${a}`);
const byId = (r: ReturnType<typeof computeExperimentMetrics>, id: string) =>
  r.variants.find((v) => v.variantId === id)!;

function run() {
  const NO_CAP = { conversionWindowDays: 14, revenueCap: { type: "none" as const } };

  // 1 — basic: denominator from assignments, conversion rate, revenue
  {
    const r = computeExperimentMetrics({
      variantIds: ["A", "B"],
      assignments: [assign("A", { userId: "u1" }), assign("A", { userId: "u2" }), assign("B", { userId: "u3" })],
      payments: [granted("u1", 40, 3, { variantId: "A" }), granted("u3", 60, 2, { variantId: "B" })],
      options: NO_CAP,
    });
    const A = byId(r, "A"), B = byId(r, "B");
    assert.equal(A.exposedUsers, 2, "A exposed = 2 (from assignments)");
    assert.equal(A.converters, 1, "A converters = 1");
    approx(A.conversionRate, 0.5, "A conversion rate");
    approx(A.firstPurchaseRevenue, 40, "A revenue");
    assert.equal(B.exposedUsers, 1, "B exposed = 1");
    approx(B.conversionRate, 1, "B conversion rate");
    approx(B.firstPurchaseRevenue, 60, "B revenue");
  }

  // 2 — renewal is a SEPARATE line, never a conversion / first-purchase revenue (H1)
  {
    const r = computeExperimentMetrics({
      variantIds: ["A"],
      assignments: [assign("A", { userId: "u1" })],
      payments: [
        granted("u1", 30, 1, { isRenewal: false }),
        granted("u1", 30, 40, { isRenewal: true }), // renewal, far outside window — still attributed to recurring
      ],
      options: NO_CAP,
    });
    const A = byId(r, "A");
    assert.equal(A.converters, 1, "renewal does not add a conversion");
    approx(A.firstPurchaseRevenue, 30, "first-purchase revenue excludes renewal");
    approx(A.recurringRevenue, 30, "recurring revenue captured separately");
  }

  // 3 — first purchase OUTSIDE the conversion window does not count
  {
    const r = computeExperimentMetrics({
      variantIds: ["A"],
      assignments: [assign("A", { userId: "u1" }, 0)],
      payments: [granted("u1", 50, 20)], // 20d > 14d window
      options: NO_CAP,
    });
    const A = byId(r, "A");
    assert.equal(A.converters, 0, "out-of-window purchase is not a conversion");
    approx(A.firstPurchaseRevenue, 0, "out-of-window purchase adds no revenue");
  }

  // 4 — attribution follows the ASSIGNED variant, not the payment's stamped variant (H2)
  {
    const r = computeExperimentMetrics({
      variantIds: ["A", "B"],
      assignments: [assign("A", { userId: "u1" })],
      payments: [granted("u1", 80, 2, { variantId: "B" })], // stamped B, assigned A
      options: NO_CAP,
    });
    assert.equal(byId(r, "A").converters, 1, "credited to assigned variant A");
    approx(byId(r, "A").firstPurchaseRevenue, 80, "revenue to A");
    assert.equal(byId(r, "B").converters, 0, "not credited to stamped variant B");
  }

  // 5 — partial refund nets proportionally; full refund excludes entirely (M2)
  {
    const r = computeExperimentMetrics({
      variantIds: ["A"],
      assignments: [assign("A", { userId: "u1" }), assign("A", { userId: "u2" })],
      payments: [
        granted("u1", 100, 1, { pi: "pi1" }),
        refund("pi1", "RefundPartial", 2500), // -$25
        granted("u2", 100, 1, { pi: "pi2" }),
        refund("pi2", "RefundProcessed"), // full → excluded
      ],
      options: NO_CAP,
    });
    const A = byId(r, "A");
    assert.equal(A.converters, 1, "fully-refunded purchase is not a conversion");
    approx(A.firstPurchaseRevenue, 75, "partial refund netted ($100-$25)");
  }

  // 6 — a user who buys twice counts as ONE converter; revenue sums (C2)
  {
    const r = computeExperimentMetrics({
      variantIds: ["A"],
      assignments: [assign("A", { userId: "u1" })],
      payments: [granted("u1", 20, 1, { pi: "x1" }), granted("u1", 20, 2, { pi: "x2" })],
      options: NO_CAP,
    });
    const A = byId(r, "A");
    assert.equal(A.converters, 1, "distinct converter count");
    approx(A.firstPurchaseRevenue, 40, "revenue sums both purchases");
  }

  // 7 — per-user capping (winsorization) tames a whale
  {
    const r = computeExperimentMetrics({
      variantIds: ["A"],
      assignments: [assign("A", { userId: "u1" }), assign("A", { userId: "u2" }), assign("A", { userId: "u3" })],
      payments: [granted("u1", 50, 1), granted("u2", 50, 1), granted("u3", 5000, 1)],
      options: { conversionWindowDays: 14, revenueCap: { type: "absolute", dollars: 100 } },
    });
    const A = byId(r, "A");
    assert.equal(r.appliedCapDollars, 100, "absolute cap applied");
    approx(A.firstPurchaseRevenue, 200, "whale capped: 50+50+100");
    approx(A.revenuePerUser, 200 / 3, "revenue per exposed user uses capped sum");
  }

  // 8 — unmerged-anon fallback to the stamped variant
  {
    const r = computeExperimentMetrics({
      variantIds: ["A", "B"],
      assignments: [assign("B", { anonymousId: "anon_x" })], // exposed anon, no userId
      payments: [granted("u9", 70, 2, { variantId: "B" })], // no assignment for u9 → fallback to stamped B
      options: NO_CAP,
    });
    const B = byId(r, "B");
    assert.equal(B.exposedUsers, 1, "anon exposure counted");
    assert.equal(B.converters, 1, "fallback credited the purchase to B");
    approx(B.firstPurchaseRevenue, 70, "fallback revenue to B");
  }

  // 9 — zero-exposure variant still appears with zeros
  {
    const r = computeExperimentMetrics({
      variantIds: ["A", "B", "C"],
      assignments: [assign("A", { userId: "u1" }), assign("B", { userId: "u2" })],
      payments: [],
      options: NO_CAP,
    });
    const C = byId(r, "C");
    assert.equal(C.exposedUsers, 0, "C has zero exposure");
    assert.equal(C.conversionRate, 0, "C rate is 0 (no divide-by-zero)");
  }

  // 10 — percentile helper sanity
  {
    approx(percentile([10, 20, 30, 40], 50), 25, "p50 interpolated");
    approx(percentile([5], 99), 5, "single value");
    approx(percentile([], 99), 0, "empty → 0");
  }

  console.log("experiment-metrics-core: all assertions passed");
}

run();
