import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  chooseChargeAction,
  decideBulkChargeAction,
  summarizeBulkRecoveryOutcome,
} from "../chargeOrRecoverPolicy";
import type { RecoverStrandedResult } from "../recoverStrandedPastDue";

function makeInvoice(overrides: Partial<Stripe.Invoice> & Record<string, unknown>): Stripe.Invoice {
  return {
    id: "in_test",
    status: "open",
    attempt_count: 0,
    next_payment_attempt: 1_700_000_000,
    amount_remaining: 2000,
    collection_method: "charge_automatically",
    ...overrides,
  } as Stripe.Invoice;
}

/** Attach an expanded `payments` list (Basil invoice_payment rows) to an invoice. */
function withPayments(invoice: Stripe.Invoice, statuses: string[]): Stripe.Invoice {
  return {
    ...(invoice as unknown as Record<string, unknown>),
    payments: { data: statuses.map((status) => ({ status })) },
  } as unknown as Stripe.Invoice;
}

// ─── chooseChargeAction (per-user) ───────────────────────────────────────────

function testRoutesToPayForLiveOpenInvoice() {
  const decision = chooseChargeAction(makeInvoice({ status: "open" }));
  assert.equal(decision.kind, "pay");
}

function testRoutesToRecoverForOpenButExhaustedInvoice() {
  // Stripe quirk: open + attempt_count >= 1 + next_payment_attempt === null
  const decision = chooseChargeAction(
    makeInvoice({ status: "open", attempt_count: 3, next_payment_attempt: null })
  );
  assert.equal(decision.kind, "recover");
}

function testRoutesToRecoverForUncollectible() {
  const decision = chooseChargeAction(makeInvoice({ status: "uncollectible" }));
  assert.equal(decision.kind, "recover");
}

function testRoutesToRecoverForVoid() {
  const decision = chooseChargeAction(makeInvoice({ status: "void" }));
  assert.equal(decision.kind, "recover");
}

function testRoutesToPayForDraft() {
  // Draft is "still chargeable" per the recovery predicate; wrapper should pay it
  // (recovery would try to void + re-bill, which is wrong for a draft).
  const decision = chooseChargeAction(makeInvoice({ status: "draft" }));
  assert.equal(decision.kind, "pay");
}

// ─── decideBulkChargeAction (bulk) ───────────────────────────────────────────

function testBulkPaysLiveOpenInvoice() {
  // Active dunning (next attempt scheduled) → pay, regardless of payments state.
  const inv = withPayments(makeInvoice({ status: "open", attempt_count: 3 }), ["open"]);
  assert.equal(decideBulkChargeAction(inv).kind, "pay");
}

function testBulkRecoversExhaustedWithAllPaymentsCanceled() {
  // The 2026-07-19 run's 558 rejections: exhausted + every PI canceled → unpayable.
  const inv = withPayments(
    makeInvoice({ status: "open", attempt_count: 1, next_payment_attempt: null }),
    ["canceled"]
  );
  assert.equal(decideBulkChargeAction(inv).kind, "recover");
}

function testBulkRecoversExhaustedWithMultipleCanceledPayments() {
  const inv = withPayments(
    makeInvoice({ status: "open", attempt_count: 9, next_payment_attempt: null }),
    ["canceled", "canceled"]
  );
  assert.equal(decideBulkChargeAction(inv).kind, "recover");
}

function testBulkPaysExhaustedButStillPayableInvoice() {
  // THE 28/177 CASE: exhausted (auto_advance false, no next attempt) but the
  // invoice_payment is still "open" (PI requires_payment_method) — invoices.pay
  // reaches the card. Must NOT be misrouted to recovery (its held draft was
  // already consumed, recovery would dead-end at no_held_draft).
  const inv = withPayments(
    makeInvoice({ status: "open", attempt_count: 1, next_payment_attempt: null }),
    ["open", "canceled"]
  );
  assert.equal(decideBulkChargeAction(inv).kind, "pay");
}

function testBulkPaysExhaustedWhenPaymentsNotExpanded() {
  // Caller forgot expand:["payments"] → preserve the legacy pay behavior rather
  // than guessing recovery (a wrong pay is a logged Stripe rejection; a wrong
  // recovery silently stops retrying a payable card).
  const inv = makeInvoice({ status: "open", attempt_count: 1, next_payment_attempt: null });
  assert.equal(decideBulkChargeAction(inv).kind, "pay");
}

function testBulkRecoversExhaustedWithEmptyPaymentsList() {
  const inv = withPayments(
    makeInvoice({ status: "open", attempt_count: 1, next_payment_attempt: null }),
    []
  );
  assert.equal(decideBulkChargeAction(inv).kind, "recover");
}

function testBulkRecoversVoidAndUncollectibleRegardlessOfPayments() {
  const voidInv = withPayments(makeInvoice({ status: "void" }), ["open"]);
  const uncollectibleInv = makeInvoice({ status: "uncollectible" });
  assert.equal(decideBulkChargeAction(voidInv).kind, "recover");
  assert.equal(decideBulkChargeAction(uncollectibleInv).kind, "recover");
}

function testBulkPaysZeroAttemptOpenInvoice() {
  // Never attempted → not stranded, even with no next_payment_attempt.
  const inv = withPayments(
    makeInvoice({ status: "open", attempt_count: 0, next_payment_attempt: null }),
    ["open"]
  );
  assert.equal(decideBulkChargeAction(inv).kind, "pay");
}

// ─── summarizeBulkRecoveryOutcome ────────────────────────────────────────────

const baseRow = {
  invoiceId: "in_new",
  customerId: "cus_1",
  userId: "u1",
  userEmail: "t@example.com",
} as const;

function testSummaryMapsSuccessfulRecovery() {
  const result: RecoverStrandedResult = {
    ok: true,
    newInvoiceId: "in_new",
    row: { ...baseRow, status: "success", amount: 2000 },
  };
  const s = summarizeBulkRecoveryOutcome(result, 1500);
  assert.equal(s.status, "success");
  assert.equal(s.amount, 2000, "should use the recovery row's amount (live cycle price)");
  assert.equal(s.newInvoiceId, "in_new");
  assert.ok(s.errorMessage.includes("in_new"));
}

function testSummaryMapsRecoveryPayDecline() {
  const result: RecoverStrandedResult = {
    ok: true,
    newInvoiceId: "in_new",
    row: { ...baseRow, status: "failed", error: "Your card has insufficient funds.", amount: 2000 },
  };
  const s = summarizeBulkRecoveryOutcome(result, 1500);
  assert.equal(s.status, "failed");
  assert.ok(s.errorMessage.includes("insufficient funds"), "decline reason must surface in the run row");
}

function testSummaryMapsRecoveryPaySkip() {
  const result: RecoverStrandedResult = {
    ok: true,
    newInvoiceId: "in_new",
    row: { ...baseRow, status: "skipped", skipReason: "too_soon", amount: 2000 },
  };
  const s = summarizeBulkRecoveryOutcome(result, 1500);
  assert.equal(s.status, "skipped");
  assert.ok(s.errorMessage.includes("too_soon"));
}

function testSummaryMapsPreStripeRefusalToSkipped() {
  const result: RecoverStrandedResult = {
    ok: false,
    reason: "no_held_draft",
    message: "No held draft invoice exists on the subscription",
  };
  const s = summarizeBulkRecoveryOutcome(result, 1500);
  assert.equal(s.status, "skipped", "refusal before any Stripe write must be a skip, not a failure");
  assert.equal(s.amount, 1500, "falls back to the worklist amount");
  assert.ok(s.errorMessage.includes("no_held_draft"));
}

function testSummaryMapsNotPastDueRefusalWithBucketableMessage() {
  const result: RecoverStrandedResult = {
    ok: false,
    reason: "not_past_due",
    message: 'Subscription status is "active", not past_due',
  };
  const s = summarizeBulkRecoveryOutcome(result, 1500);
  assert.equal(s.status, "skipped");
  // classifySkipReason buckets on "not past_due" — the message must keep that phrase.
  assert.ok(s.errorMessage.toLowerCase().includes("not past_due"));
}

function testSummaryMapsAlreadyPaidRefusalWithBucketableMessage() {
  const result: RecoverStrandedResult = {
    ok: false,
    reason: "invoice_already_paid",
    message: 'Original invoice status is "paid"; not stranded',
  };
  const s = summarizeBulkRecoveryOutcome(result, 1500);
  assert.equal(s.status, "skipped");
  // classifySkipReason buckets on "already_paid" (underscore variant).
  assert.ok(s.errorMessage.toLowerCase().includes("already_paid"));
}

function testSummaryMapsMidFlightFailureToFailed() {
  for (const reason of ["void_failed", "draft_create_failed", "finalize_failed"] as const) {
    const result: RecoverStrandedResult = { ok: false, reason, message: "boom" };
    const s = summarizeBulkRecoveryOutcome(result, 1500);
    assert.equal(s.status, "failed", `${reason} happened mid-flight — must be failed, not skipped`);
    assert.ok(s.errorMessage.includes(reason));
  }
}

function run() {
  testRoutesToPayForLiveOpenInvoice();
  testRoutesToRecoverForOpenButExhaustedInvoice();
  testRoutesToRecoverForUncollectible();
  testRoutesToRecoverForVoid();
  testRoutesToPayForDraft();
  testBulkPaysLiveOpenInvoice();
  testBulkRecoversExhaustedWithAllPaymentsCanceled();
  testBulkRecoversExhaustedWithMultipleCanceledPayments();
  testBulkPaysExhaustedButStillPayableInvoice();
  testBulkPaysExhaustedWhenPaymentsNotExpanded();
  testBulkRecoversExhaustedWithEmptyPaymentsList();
  testBulkRecoversVoidAndUncollectibleRegardlessOfPayments();
  testBulkPaysZeroAttemptOpenInvoice();
  testSummaryMapsSuccessfulRecovery();
  testSummaryMapsRecoveryPayDecline();
  testSummaryMapsRecoveryPaySkip();
  testSummaryMapsPreStripeRefusalToSkipped();
  testSummaryMapsNotPastDueRefusalWithBucketableMessage();
  testSummaryMapsAlreadyPaidRefusalWithBucketableMessage();
  testSummaryMapsMidFlightFailureToFailed();
  console.log("chargeOrRecoverPolicy tests passed");
}

run();
