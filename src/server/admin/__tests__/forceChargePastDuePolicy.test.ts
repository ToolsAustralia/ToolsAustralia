// src/server/admin/__tests__/forceChargePastDuePolicy.test.ts
import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  buildForceChargeFinalizeIdempotencyKey,
  pickForceChargeTarget,
  isCurrentPeriodAlreadyPaid,
  hasRecentSuccessfulChargeOnSubscription,
} from "../forceChargePastDuePolicy";

function testFinalizeKey() {
  assert.equal(buildForceChargeFinalizeIdempotencyKey("in_x"), "force-finalize-in_x");
  assert.notEqual(
    buildForceChargeFinalizeIdempotencyKey("in_a"),
    buildForceChargeFinalizeIdempotencyKey("in_b")
  );
}

function testPickTargetPrefersOpenOverDraft() {
  const open = [
    { id: "in_o1", status: "open", collection_method: "charge_automatically", amount_remaining: 4000, created: 200 } as Stripe.Invoice,
  ];
  const draft = [
    { id: "in_d1", status: "draft", amount_due: 4000, created: 300 } as Stripe.Invoice,
  ];
  const t = pickForceChargeTarget(open, draft, 4000);
  assert.equal(t?.invoice.id, "in_o1");
  assert.equal(t?.kind, "open");
}

function testPickTargetFallsBackToMatchingDraft() {
  const t = pickForceChargeTarget(
    [],
    [
      { id: "in_d1", status: "draft", amount_due: 2000, created: 100 } as Stripe.Invoice,
      { id: "in_d2", status: "draft", amount_due: 4000, created: 300 } as Stripe.Invoice,
      { id: "in_d3", status: "draft", amount_due: 4000, created: 200 } as Stripe.Invoice,
    ],
    4000
  );
  // newest matching draft wins
  assert.equal(t?.invoice.id, "in_d2");
  assert.equal(t?.kind, "draft");
}

function testPickTargetReturnsNullWhenNeitherFits() {
  // No open invoices, no draft matching expected amount
  const t = pickForceChargeTarget(
    [],
    [{ id: "in_d1", status: "draft", amount_due: 2000, created: 100 } as Stripe.Invoice],
    4000
  );
  assert.equal(t, null);
}

function testPickTargetSkipsManualCollection() {
  // open invoice with collection_method: "send_invoice" must not be picked
  const open = [
    { id: "in_o1", status: "open", collection_method: "send_invoice", amount_remaining: 4000, created: 200 } as Stripe.Invoice,
  ];
  const t = pickForceChargeTarget(open, [], 4000);
  assert.equal(t, null);
}

function testPickTargetSkipsZeroRemaining() {
  const open = [
    { id: "in_o1", status: "open", collection_method: "charge_automatically", amount_remaining: 0, created: 200 } as Stripe.Invoice,
  ];
  const t = pickForceChargeTarget(open, [], 4000);
  assert.equal(t, null);
}

function testPickTargetStrandedOpenReturnsStranded() {
  // open + retry-exhausted (attempt_count>=1 && next_payment_attempt==null) => kind:"stranded"
  const open = [
    {
      id: "in_s1",
      status: "open",
      collection_method: "charge_automatically",
      amount_remaining: 4000,
      attempt_count: 1,
      next_payment_attempt: null,
      created: 200,
    } as unknown as Stripe.Invoice,
  ];
  const t = pickForceChargeTarget(open, [], 4000);
  assert.equal(t?.kind, "stranded");
  assert.equal(t?.invoice.id, "in_s1");
}

function testPickTargetLiveOpenPreferredOverStranded() {
  // A live open (Stripe still retrying) is preferred over a stranded one — even if older.
  const open = [
    {
      id: "in_stranded",
      status: "open",
      collection_method: "charge_automatically",
      amount_remaining: 4000,
      attempt_count: 3,
      next_payment_attempt: null,
      created: 400,
    } as unknown as Stripe.Invoice,
    {
      id: "in_live",
      status: "open",
      collection_method: "charge_automatically",
      amount_remaining: 4000,
      attempt_count: 1,
      next_payment_attempt: 9999999999,
      created: 100,
    } as unknown as Stripe.Invoice,
  ];
  const t = pickForceChargeTarget(open, [], 4000);
  assert.equal(t?.kind, "open");
  assert.equal(t?.invoice.id, "in_live");
}

function testPickTargetStrandedPreferredOverDraft() {
  // A stranded open is recovered before falling back to a held draft.
  const open = [
    {
      id: "in_s1",
      status: "open",
      collection_method: "charge_automatically",
      amount_remaining: 4000,
      attempt_count: 2,
      next_payment_attempt: null,
      created: 200,
    } as unknown as Stripe.Invoice,
  ];
  const draft = [{ id: "in_d1", status: "draft", amount_due: 4000, created: 300 } as Stripe.Invoice];
  const t = pickForceChargeTarget(open, draft, 4000);
  assert.equal(t?.kind, "stranded");
  assert.equal(t?.invoice.id, "in_s1");
}

function testPeriodAlreadyPaidWhenInvoiceCoversCurrentEnd() {
  const paid = [
    {
      id: "in_p1",
      status: "paid",
      period: { start: 1714867200, end: 1717545600 }, // May 5 - Jun 5
    } as unknown as Stripe.Invoice,
  ];
  // Current period: May 6 - Jun 6
  assert.equal(
    isCurrentPeriodAlreadyPaid(paid, 1714953600, 1717632000),
    true
  );
}

function testPeriodNotPaidWhenNoOverlap() {
  const paid = [
    {
      id: "in_p1",
      status: "paid",
      period: { start: 1712188800, end: 1714867200 }, // April
    } as unknown as Stripe.Invoice,
  ];
  // Current period: May 6 - Jun 6
  assert.equal(
    isCurrentPeriodAlreadyPaid(paid, 1714953600, 1717632000),
    false
  );
}

function testPeriodNotPaidWhenNoPaidInvoices() {
  assert.equal(isCurrentPeriodAlreadyPaid([], 1714953600, 1717632000), false);
}

function testRecentSuccessLockBlocksWithinWindow() {
  const now = new Date("2026-05-05T12:00:00.000Z");
  const rows = [
    {
      attemptedAt: new Date("2026-05-05T05:00:00.000Z"), // 7h ago
      status: "success" as const,
      result: { subscriptionId: "sub_target" },
    },
  ];
  assert.equal(hasRecentSuccessfulChargeOnSubscription(rows, "sub_target", now), true);
}

function testRecentSuccessLockAllowsAfterWindow() {
  const now = new Date("2026-05-05T12:00:00.000Z");
  const rows = [
    {
      attemptedAt: new Date("2026-05-04T11:00:00.000Z"), // 25h ago
      status: "success" as const,
      result: { subscriptionId: "sub_target" },
    },
  ];
  assert.equal(hasRecentSuccessfulChargeOnSubscription(rows, "sub_target", now), false);
}

function testRecentSuccessLockIgnoresFailedRows() {
  const now = new Date("2026-05-05T12:00:00.000Z");
  const rows = [
    {
      attemptedAt: new Date("2026-05-05T05:00:00.000Z"),
      status: "failed" as const,
      result: { subscriptionId: "sub_target" },
    },
  ];
  assert.equal(hasRecentSuccessfulChargeOnSubscription(rows, "sub_target", now), false);
}

function testRecentSuccessLockIgnoresOtherSubscriptions() {
  const now = new Date("2026-05-05T12:00:00.000Z");
  const rows = [
    {
      attemptedAt: new Date("2026-05-05T05:00:00.000Z"),
      status: "success" as const,
      result: { subscriptionId: "sub_other" },
    },
  ];
  assert.equal(hasRecentSuccessfulChargeOnSubscription(rows, "sub_target", now), false);
}

function run() {
  testFinalizeKey();
  testPickTargetPrefersOpenOverDraft();
  testPickTargetFallsBackToMatchingDraft();
  testPickTargetReturnsNullWhenNeitherFits();
  testPickTargetSkipsManualCollection();
  testPickTargetSkipsZeroRemaining();
  testPickTargetStrandedOpenReturnsStranded();
  testPickTargetLiveOpenPreferredOverStranded();
  testPickTargetStrandedPreferredOverDraft();
  testPeriodAlreadyPaidWhenInvoiceCoversCurrentEnd();
  testPeriodNotPaidWhenNoOverlap();
  testPeriodNotPaidWhenNoPaidInvoices();
  testRecentSuccessLockBlocksWithinWindow();
  testRecentSuccessLockAllowsAfterWindow();
  testRecentSuccessLockIgnoresFailedRows();
  testRecentSuccessLockIgnoresOtherSubscriptions();
  console.log("forceChargePastDuePolicy tests passed");
}

run();
