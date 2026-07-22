import assert from "node:assert/strict";
import {
  shouldReanchorAfterRecovery,
  shouldReanchorRebillToAnchor24,
  type ReanchorGateInput,
  type RebillReanchorGateInput,
} from "../pauseCollectionPolicy";

// Neutral base: only `previousSubscriptionDbStatus: "past_due"` is an active dunning signal;
// pause is absent and attempt_count is the on-time value. Each test overrides exactly the field
// it isolates, so a passing test proves that one signal (not a conflation of all three).
const base: ReanchorGateInput = {
  billingReason: "subscription_cycle",
  invoiceIsPaid: true,
  previousSubscriptionDbStatus: "past_due",
  pauseCollectionPresentAtPayment: false,
  invoiceAttemptCount: 1,
  invoiceMetadataDunningRecovery: false,
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
  assert.equal(
    t({ previousSubscriptionDbStatus: "active", invoiceMetadataDunningRecovery: true }),
    true,
    "dunning_recovery invoice metadata alone (renew-subscription channel)"
  );

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
  assert.equal(t({ invoiceMetadataDunningRecovery: true, cancelAtPeriodEnd: true }), false, "cancel excludes even with the dunning_recovery marker");

  runRebillClamp();
  console.log("reanchor-gate tests passed");
}

// shouldReanchorRebillToAnchor24 — clamps a mint RE-BILL (subscription_update) to the 24th, but ONLY when the
// recovery landed on the 25/26/27 (the days where the clamp actually moves the renewal date).
const rebillBase: RebillReanchorGateInput = {
  isRebill: true,
  invoiceIsPaid: true,
  recoveryDayIsAnchorWindow: true, // recovery on 25/26/27
  cancelAtPeriodEnd: false,
  autoRenew: true,
  alreadyReanchoredInvoiceId: undefined,
  invoiceId: "in_rebill",
};
function r(over: Partial<RebillReanchorGateInput>): boolean {
  return shouldReanchorRebillToAnchor24({ ...rebillBase, ...over });
}
function runRebillClamp() {
  // Fires: a paid re-bill that landed in the 25/26/27 window.
  assert.equal(r({}), true, "re-bill on 25/26/27 → clamp to 24th");

  // The window gate is the whole point: a re-bill on any other day already anchors ~1mo out — no reanchor.
  assert.equal(r({ recoveryDayIsAnchorWindow: false }), false, "re-bill outside 25/26/27 → no clamp (stays active)");
  // Not a re-bill (normal renewal / held-draft recovery) → this gate never applies (that path uses shouldReanchorAfterRecovery).
  assert.equal(r({ isRebill: false }), false, "non-rebill excluded");
  // A failed mint (unpaid) never reanchors.
  assert.equal(r({ invoiceIsPaid: false }), false, "unpaid re-bill excluded");
  // Ending / autoRenew-off members are never silently extended (parity with shouldReanchorAfterRecovery).
  assert.equal(r({ cancelAtPeriodEnd: true }), false, "cancel-at-period-end excluded despite 25/26/27");
  assert.equal(r({ autoRenew: false }), false, "autoRenew off excluded despite 25/26/27");
  assert.equal(r({ autoRenew: undefined }), true, "autoRenew undefined is allowed (only false excludes)");
  // Idempotency pre-filter: same invoice already reanchored → skip (atomic claim is the authoritative backstop).
  assert.equal(r({ alreadyReanchoredInvoiceId: "in_rebill" }), false, "already reanchored this invoice excluded");
  assert.equal(r({ alreadyReanchoredInvoiceId: "in_OTHER" }), true, "different reanchored invoice does not block");
}

run();
