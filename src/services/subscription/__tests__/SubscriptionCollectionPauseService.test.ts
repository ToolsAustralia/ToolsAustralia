import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  shouldClearPauseCollectionAfterPaidInvoice,
  describePauseCollection,
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

function run() {
  testClearsOnPastDueRecovery();
  testClearsOnRenewalLikeBillingReasons();
  testNoClearOnRandomCreate();
  testDescribePauseCollection();
  console.log("pauseCollectionPolicy tests passed");
}

run();
