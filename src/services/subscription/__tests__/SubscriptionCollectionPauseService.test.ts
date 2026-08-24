import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  shouldClearPauseCollectionAfterPaidInvoice,
  describePauseCollection,
  decideClearPause,
  readPauseCollection,
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
// The clear decision is now `pauseCollectionPresent && pauseReason !== "retention"`.
//
// It used to be the disjunction
//   shouldClearPauseCollectionAfterPaidInvoice(...) || recordMembershipRecurringAffiliate
//     || subscription.pause_collection != null
// which meant a plain `subscription_cycle` renewal cleared a pause that was never set — a
// `/v1/subscriptions` WRITE per renewal that changed nothing, on the endpoint that broke on
// 2026-08-23 (73 req/sec vs Stripe's 25/sec per-endpoint cap). Every disjunct was ORed with
// `pauseCollectionPresent`, so requiring a pause to exist only removes no-op writes.
// pauseReason undefined == non-retention pause.

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
  // affiliate recurring with NO pause present -> false. There is nothing to clear, so the
  // Stripe write is skipped (it was a no-op). This assertion used to be `true`.
  assert.equal(
    decideClearPause({
      billingReason: "manual",
      previousSubscriptionDbStatus: "active",
      pauseCollectionPresent: false,
      pauseReason: undefined,
      recordMembershipRecurringAffiliate: true,
    }),
    false
  );
}

function testDecideClearPauseUnpausedRenewalSkipsTheWrite() {
  // THE renewal case: a normal `subscription_cycle` on a member who was never paused.
  // ~900 of these land in one minute on the 24th; each used to spend a `/v1/subscriptions`
  // write clearing a pause that does not exist.
  assert.equal(
    decideClearPause({
      billingReason: "subscription_cycle",
      previousSubscriptionDbStatus: "active",
      pauseCollectionPresent: false,
      pauseReason: undefined,
      recordMembershipRecurringAffiliate: true,
    }),
    false
  );
  // …and a past-due recovery whose pause was already lifted out-of-band (the admin charge job
  // and renew-subscription both resume collection before the webhook arrives) needs no second
  // write either.
  assert.equal(
    decideClearPause({
      billingReason: "subscription_cycle",
      previousSubscriptionDbStatus: "past_due",
      pauseCollectionPresent: false,
      pauseReason: undefined,
    }),
    false
  );
}

function testDecideClearPausePausedRenewalStillClears() {
  // The case that must NOT regress: a paused member pays their renewal — collection has to be
  // resumed or `keep_as_draft` holds their next cycle invoice as a draft forever.
  assert.equal(
    decideClearPause({
      billingReason: "subscription_cycle",
      previousSubscriptionDbStatus: "active",
      pauseCollectionPresent: true,
      pauseReason: undefined,
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

// --- readPauseCollection: null is an ANSWER, undefined is a MISSING answer ---
// The webhook reads pause_collection off the subscription EXPANDED inside invoices.retrieve rather
// than off a fresh subscriptions.retrieve. If an absent field were read as "not paused", a paused
// member who has just PAID would stay collection-paused — and for that cohort this webhook is the
// only automatic clearer (pay-failed-invoice does not resume; prepareRecoveredCycleInvoice never
// resumes). So "absent" must route to a re-read, not to a guess.

function testReadPauseCollectionPaused() {
  const keepAsDraft: Stripe.Subscription.PauseCollection = {
    behavior: "keep_as_draft",
    resumes_at: null,
  };
  assert.equal(readPauseCollection({ pause_collection: keepAsDraft }), "paused");
}

function testReadPauseCollectionExplicitNullIsTrusted() {
  // The common renewal shape, and the one the whole call-count saving rests on.
  assert.equal(readPauseCollection({ pause_collection: null }), "not_paused");
}

function testReadPauseCollectionAbsentIsUnknown() {
  // Field not on the wire object at all -> caller must re-read from Stripe.
  assert.equal(readPauseCollection({}), "unknown");
  assert.equal(readPauseCollection({ pause_collection: undefined }), "unknown");
}

function run() {
  testClearsOnPastDueRecovery();
  testClearsOnRenewalLikeBillingReasons();
  testNoClearOnRandomCreate();
  testDescribePauseCollection();
  testDecideClearPauseRecovery();
  testDecideClearPauseNonNullPauseUnrelatedInvoice();
  testDecideClearPauseAffiliateClause();
  testDecideClearPauseUnpausedRenewalSkipsTheWrite();
  testDecideClearPausePausedRenewalStillClears();
  testDecideClearPauseNothingApplies();
  testDecideClearPauseRetentionNeverCleared();
  testReadPauseCollectionPaused();
  testReadPauseCollectionExplicitNullIsTrusted();
  testReadPauseCollectionAbsentIsUnknown();
  console.log("pauseCollectionPolicy tests passed");
}

run();
