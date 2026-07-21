/**
 * isRebillPayment / effectiveBillingReasonForRebill — pure predicate that lets the webhook treat a
 * past-due re-bill (subscription_update) as a RENEWAL everywhere. No deps. Run: npm run test:rebill-classification
 */
import assert from "node:assert/strict";
import { isRebillPayment, effectiveBillingReasonForRebill } from "../rebill-classification";

function run() {
  const base = { isUpgrade: false, billingAnchorRule: undefined as string | undefined, previousSubscriptionStatus: undefined as string | undefined };

  // Re-bill — recognised by the durable mint marker.
  assert.equal(isRebillPayment({ ...base, billingReason: "subscription_update", billingAnchorRule: "rebill_current_cycle" }), true, "marker → rebill");
  // Re-bill — recognised by the member being past_due / unpaid (marker-independent fallback).
  assert.equal(isRebillPayment({ ...base, billingReason: "subscription_update", previousSubscriptionStatus: "past_due" }), true, "past_due → rebill");
  assert.equal(isRebillPayment({ ...base, billingReason: "subscription_update", previousSubscriptionStatus: "unpaid" }), true, "unpaid → rebill");

  // NOT a re-bill: a real UPGRADE (subscription_update) must stay an upgrade, even with the marker persisting.
  assert.equal(isRebillPayment({ ...base, billingReason: "subscription_update", isUpgrade: true, billingAnchorRule: "rebill_current_cycle" }), false, "upgrade excluded");
  // NOT a re-bill: an ambiguous subscription_update from an ACTIVE member with no marker.
  assert.equal(isRebillPayment({ ...base, billingReason: "subscription_update", previousSubscriptionStatus: "active" }), false, "active + no marker → not rebill");
  // INVARIANT PIN (2026-07-21 review): the durable marker classifies as a re-bill EVEN if the DB status
  // already flipped to active — race-proofness for the re-bill's own success event. Safe only while no
  // live non-upgrade non-zero subscription_update is emitted on a re-billed sub (a downgrade emits no
  // invoice, so it never reaches here). See the caveat in rebill-classification.ts.
  assert.equal(isRebillPayment({ ...base, billingReason: "subscription_update", billingAnchorRule: "rebill_current_cycle", previousSubscriptionStatus: "active" }), true, "durable marker → rebill even when status flipped to active (race-proof; invariant-guarded)");
  // NOT a re-bill: normal renewal / initial subscription pass through untouched.
  assert.equal(isRebillPayment({ ...base, billingReason: "subscription_cycle", previousSubscriptionStatus: "active" }), false, "subscription_cycle → not rebill");
  assert.equal(isRebillPayment({ ...base, billingReason: "subscription_create" }), false, "subscription_create → not rebill");

  // Effective billing_reason: a re-bill collapses to subscription_cycle; everything else is unchanged.
  assert.equal(effectiveBillingReasonForRebill("subscription_update", true), "subscription_cycle", "rebill → subscription_cycle");
  assert.equal(effectiveBillingReasonForRebill("subscription_update", false), "subscription_update", "upgrade passes through");
  assert.equal(effectiveBillingReasonForRebill("subscription_cycle", false), "subscription_cycle", "cycle passes through");
  assert.equal(effectiveBillingReasonForRebill(null, false), undefined, "null → undefined");

  console.log("rebill-classification tests passed");
}
run();
