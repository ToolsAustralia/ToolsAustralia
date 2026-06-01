import assert from "node:assert/strict";
import { shouldReanchorAfterRecovery, type ReanchorGateInput } from "../pauseCollectionPolicy";

const base: ReanchorGateInput = {
  billingReason: "subscription_cycle",
  invoiceIsPaid: true,
  previousSubscriptionDbStatus: "past_due",
  pauseCollectionPresentAtPayment: true,
  invoiceAttemptCount: 2,
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
  assert.equal(t({}), true, "happy past_due path");
  assert.equal(t({ billingReason: "subscription_create" }), false, "non-cycle excluded");
  assert.equal(t({ invoiceIsPaid: false }), false, "unpaid excluded");
  assert.equal(t({ cancelAtPeriodEnd: true }), false, "cancel-at-period-end excluded");
  assert.equal(t({ autoRenew: false }), false, "autoRenew off excluded");
  assert.equal(t({ pauseReason: "retention" }), false, "retention pause excluded");
  assert.equal(t({ alreadyReanchoredInvoiceId: "in_123" }), false, "already reanchored excluded");
  assert.equal(t({ previousSubscriptionDbStatus: "unpaid" }), true, "unpaid recovers");
  assert.equal(
    t({ previousSubscriptionDbStatus: "active", pauseCollectionPresentAtPayment: false, invoiceAttemptCount: 2 }),
    true,
    "renew-subscription pre-flip caught by attempt_count"
  );
  assert.equal(
    t({ previousSubscriptionDbStatus: "active", pauseCollectionPresentAtPayment: false, invoiceAttemptCount: 1 }),
    false,
    "normal on-time renewal excluded"
  );
  assert.equal(
    t({ previousSubscriptionDbStatus: "active", pauseCollectionPresentAtPayment: true, invoiceAttemptCount: undefined }),
    true,
    "pause_collection arm"
  );
  console.log("reanchor-gate tests passed");
}

run();
