import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  shouldClearPauseCollectionAfterPaidInvoice,
  describePauseCollection,
  decideClearPause,
} from "../pauseCollectionPolicy";

function testClearsOnPastDueRecovery() {
  assert.equal(
    shouldClearPauseCollectionAfterPaidInvoice({
      billingReason: "subscription_create",
      previousSubscriptionDbStatus: "past_due",
    }),
    true
  );
  assert.equal(
    shouldClearPauseCollectionAfterPaidInvoice({
      billingReason: "subscription_create",
      previousSubscriptionDbStatus: "unpaid",
    }),
    true
  );
}

function testClearsOnRenewalLikeBillingReasons() {
  for (const br of ["subscription_cycle", "subscription_threshold", "subscription_update"] as const) {
    assert.equal(
      shouldClearPauseCollectionAfterPaidInvoice({
        billingReason: br,
        previousSubscriptionDbStatus: "active",
      }),
      true
    );
  }
}

function testNoClearOnRandomCreate() {
  assert.equal(
    shouldClearPauseCollectionAfterPaidInvoice({
      billingReason: "subscription_create",
      previousSubscriptionDbStatus: "active",
    }),
    false
  );
}

function testDescribePauseCollection() {
  assert.equal(describePauseCollection({ pause_collection: null }), "none");
  const keepAsDraft: Stripe.Subscription.PauseCollection = {
    behavior: "keep_as_draft",
    resumes_at: null,
  };
  assert.equal(describePauseCollection({ pause_collection: keepAsDraft }), "keep_as_draft");
}

// --- decideClearPause characterization tests ---
// Pin the CURRENT full clear decision from stripe-webhook-handlers/index.ts:3430-3436:
//   shouldClearPauseCollectionAfterPaidInvoice(...) || recordMembershipRecurringAffiliate
//     || subscription.pause_collection != null
// expressed against the new pure function. pauseReason undefined == current/legacy behavior.

function testDecideClearPauseRecovery() {
  // past_due recovery cycle: legacy clears -> true
  assert.equal(
    decideClearPause({
      billingReason: "subscription_cycle",
      previousSubscriptionDbStatus: "past_due",
      pauseCollectionPresent: true,
      pauseReason: undefined,
    }),
    true
  );
}

function testDecideClearPauseNonNullPauseUnrelatedInvoice() {
  // unrelated paid invoice but pause_collection present -> true (the moved `!= null` clause)
  assert.equal(
    decideClearPause({
      billingReason: "manual",
      previousSubscriptionDbStatus: "active",
      pauseCollectionPresent: true,
      pauseReason: undefined,
    }),
    true
  );
}

function testDecideClearPauseAffiliateClause() {
  // affiliate recurring -> true even with no pause present and unrelated invoice
  assert.equal(
    decideClearPause({
      billingReason: "manual",
      previousSubscriptionDbStatus: "active",
      pauseCollectionPresent: false,
      pauseReason: undefined,
      recordMembershipRecurringAffiliate: true,
    }),
    true
  );
}

function testDecideClearPauseNothingApplies() {
  assert.equal(
    decideClearPause({
      billingReason: "manual",
      previousSubscriptionDbStatus: "active",
      pauseCollectionPresent: false,
      pauseReason: undefined,
    }),
    false
  );
}

function testDecideClearPauseRetentionNeverCleared() {
  // retention pause is NOT cleared even when every legacy condition would clear it
  assert.equal(
    decideClearPause({
      billingReason: "subscription_cycle",
      previousSubscriptionDbStatus: "past_due",
      pauseCollectionPresent: true,
      pauseReason: "retention",
    }),
    false
  );
}

function run() {
  testClearsOnPastDueRecovery();
  testClearsOnRenewalLikeBillingReasons();
  testNoClearOnRandomCreate();
  testDescribePauseCollection();
  testDecideClearPauseRecovery();
  testDecideClearPauseNonNullPauseUnrelatedInvoice();
  testDecideClearPauseAffiliateClause();
  testDecideClearPauseNothingApplies();
  testDecideClearPauseRetentionNeverCleared();
  console.log("pauseCollectionPolicy tests passed");
}

run();
