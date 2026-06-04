import assert from "node:assert/strict";
import {
  classifyAcquisitionCategory,
  buildByCategory,
  ACQUISITION_CATEGORIES,
  type AcquisitionCategory,
} from "../platformRevenueBreakdown";
import { classifyRevenueBucket } from "@/services/admin/dashboard-stats/snapshotSchema";

type Ev = Parameters<typeof classifyAcquisitionCategory>[0];
const ev = (partial: Partial<Ev>): Ev =>
  ({ userId: "u1", data: {}, timestamp: new Date("2026-05-01"), ...partial }) as Ev;

function run() {
  // classifier
  assert.equal(classifyAcquisitionCategory(ev({ packageType: "membership", data: {} })), "membership-purchase");
  assert.equal(
    classifyAcquisitionCategory(ev({ packageType: "membership", data: { billingReason: "subscription_cycle" } })),
    null,
    "renewal excluded",
  );
  assert.equal(classifyAcquisitionCategory(ev({ packageType: "one-time", packageId: "tradie-pack" })), "one-time-purchase");
  assert.equal(
    classifyAcquisitionCategory(ev({ packageType: "one-time", packageId: "additional-tradie-pack" })),
    "additional-one-time",
  );
  assert.equal(classifyAcquisitionCategory(ev({ packageType: "one-time" })), "one-time-purchase", "no packageId → first");
  assert.equal(classifyAcquisitionCategory(ev({ packageType: "mini-draw" })), "mini-draw");
  assert.equal(classifyAcquisitionCategory(ev({ packageType: "upsell" })), "upsell");
  assert.equal(classifyAcquisitionCategory(ev({ packageType: "weird" })), null, "unknown type excluded");

  // bucketer: zero-filled 5 buckets, distinct users, renewals excluded, stable order
  const events: Ev[] = [
    ev({ userId: "a", packageType: "membership", data: { price: 50 } }),
    ev({ userId: "b", packageType: "membership", data: { price: 50 } }),
    ev({ userId: "a", packageType: "membership", data: { price: 50, billingReason: "subscription_cycle" } }),
    ev({ userId: "a", packageType: "one-time", packageId: "tradie-pack", data: { price: 75 } }),
    ev({ userId: "c", packageType: "one-time", packageId: "additional-tradie-pack", data: { price: 25 } }),
    ev({ userId: "d", packageType: "upsell", data: { price: 10 } }),
  ];
  const bc = buildByCategory(events);
  assert.equal(bc.length, 5, "always 5 buckets");
  assert.deepEqual(bc.map((b) => b.category), ACQUISITION_CATEGORIES, "stable order");
  const m = bc.find((b) => b.category === "membership-purchase")!;
  assert.equal(m.revenue, 100, "renewal excluded from membership revenue");
  assert.equal(m.purchaseCount, 2);
  assert.equal(m.userCount, 2, "distinct users a,b");
  assert.equal(bc.find((b) => b.category === "one-time-purchase")!.revenue, 75);
  assert.equal(bc.find((b) => b.category === "additional-one-time")!.revenue, 25);
  assert.equal(bc.find((b) => b.category === "mini-draw")!.revenue, 0, "zero-filled");
  assert.equal(bc.find((b) => b.category === "upsell")!.revenue, 10);
  assert.equal(bc.reduce((s, b) => s + b.revenue, 0), 100 + 75 + 25 + 10, "bars sum to acquisition total");

  // Lockstep with the snapshot bucketer (classifyRevenueBucket) — the classifier that
  // drives the card's per-platform revenue. The drill-down bars only reconcile with the
  // card if these two agree, so assert it directly (membershipRenewal / null → excluded).
  const bucketToAcq: Record<string, AcquisitionCategory | null> = {
    membershipPurchase: "membership-purchase",
    membershipRenewal: null,
    oneTimePurchase: "one-time-purchase",
    additionalOneTimePurchase: "additional-one-time",
    miniDraw: "mini-draw",
    upsell: "upsell",
  };
  const lockstepCases: Array<{ packageType?: string; packageId?: string; billingReason?: string }> = [
    { packageType: "membership" },
    { packageType: "membership", billingReason: "subscription_cycle" },
    { packageType: "one-time", packageId: "tradie-pack" },
    { packageType: "one-time", packageId: "additional-tradie-pack" },
    { packageType: "one-time" },
    { packageType: "one-time", packageId: "legacy-thing" }, // odd id: both → one-time-purchase
    { packageType: "mini-draw" },
    { packageType: "upsell" },
    { packageType: "weird" }, // unknown → both exclude
  ];
  for (const c of lockstepCases) {
    const bucket = classifyRevenueBucket({
      packageType: c.packageType,
      packageId: c.packageId,
      billingReason: c.billingReason,
    });
    const expected = bucket == null ? null : bucketToAcq[bucket];
    const actual = classifyAcquisitionCategory(
      ev({ packageType: c.packageType, packageId: c.packageId, data: c.billingReason ? { billingReason: c.billingReason } : {} }),
    );
    assert.equal(actual, expected, `lockstep ${JSON.stringify(c)}: bucket=${bucket} → expected ${expected}, got ${actual}`);
  }

  console.log("✓ platformRevenueBreakdown: all assertions passed");
}

run();
