import assert from "node:assert/strict";
import { shouldReanchorAfterRecovery, type ReanchorGateInput } from "../pauseCollectionPolicy";

// Neutral base: only `previousSubscriptionDbStatus: "past_due"` is an active dunning signal;
// pause is absent and attempt_count is the on-time value. Each test overrides exactly the field
// it isolates, so a passing test proves that one signal (not a conflation of all three).
const base: ReanchorGateInput = {
  billingReason: "subscription_cycle",
  invoiceIsPaid: true,
  previousSubscriptionDbStatus: "past_due",
  pauseCollectionPresentAtPayment: false,
  invoiceAttemptCount: 1,
  pauseReason: undefined,
  cancelAtPeriodEnd: false,
  autoRenew: true,
  alreadyReanchoredInvoiceId: undefined,
  invoiceId: "in_123",
};

function t(over: Partial<ReanchorGateInput>): boolean {
  return shouldReanchorAfterRecovery({ ...base, ...over });
}

function run() {
  // Dunning-signal isolation (each true via exactly one signal).
  assert.equal(t({}), true, "past_due alone");
  assert.equal(t({ previousSubscriptionDbStatus: "unpaid" }), true, "unpaid alone");
  assert.equal(t({ previousSubscriptionDbStatus: "PAST_DUE" }), true, "status compare is case-insensitive");
  assert.equal(
    t({ previousSubscriptionDbStatus: "active", pauseCollectionPresentAtPayment: true }),
    true,
    "pause_collection alone"
  );
  assert.equal(
    t({ previousSubscriptionDbStatus: "active", invoiceAttemptCount: 2 }),
    true,
    "attempt_count>1 alone (renew-subscription pre-flip channel)"
  );
  assert.equal(t({ invoiceAttemptCount: undefined }), true, "past_due holds when attempt_count is undefined");

  // Exclusions.
  assert.equal(t({ previousSubscriptionDbStatus: "active" }), false, "normal on-time renewal: no dunning signal");
  assert.equal(t({ billingReason: "subscription_create" }), false, "non-cycle excluded");
  assert.equal(t({ invoiceIsPaid: false }), false, "unpaid invoice excluded");
  assert.equal(t({ cancelAtPeriodEnd: true }), false, "cancel-at-period-end excluded despite past_due");
  assert.equal(t({ autoRenew: false }), false, "autoRenew off excluded despite past_due");
  assert.equal(t({ autoRenew: undefined }), true, "autoRenew undefined is allowed (only false excludes)");
  assert.equal(t({ pauseReason: "retention" }), false, "retention pause excluded despite past_due");
  assert.equal(t({ alreadyReanchoredInvoiceId: "in_123" }), false, "already reanchored this invoice excluded");
  assert.equal(t({ alreadyReanchoredInvoiceId: "in_OTHER" }), true, "different reanchored invoice does not block");

  console.log("reanchor-gate tests passed");
}

run();
