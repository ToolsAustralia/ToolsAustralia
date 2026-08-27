/**
 * Tests for `hasEverPaid` (`src/utils/auth/has-ever-paid.ts`).
 *
 * This predicate decides who can trigger a paid SMS send. Getting it wrong costs
 * money in one direction and locks out paying customers in the other, so both
 * failure modes are pinned here against the real production shapes.
 *
 * Run: npm run test:has-ever-paid
 */

import assert from "node:assert/strict";
import { hasEverPaid } from "../has-ever-paid";

/** The six account shapes that actually exist in production. */
const NEVER_PAID_REGISTRANT = {
  // register/route.ts creates the Stripe customer BEFORE any payment, so a
  // stripeCustomerId is present here. It must NOT count as having paid —
  // ~44,400 accounts look like this.
  processedPayments: [],
  oneTimePackages: [],
  subscription: { isActive: false, status: "incomplete" },
};

const ACTIVE_MEMBER = {
  processedPayments: ["invoice_abc"],
  stripeSubscriptionId: "sub_123",
  oneTimePackages: [],
  subscription: { isActive: true, startDate: new Date("2026-01-01") },
};

const PAST_DUE_MEMBER = {
  processedPayments: ["invoice_abc"],
  stripeSubscriptionId: "sub_123",
  oneTimePackages: [],
  subscription: { isActive: false, status: "past_due", startDate: new Date("2026-01-01") },
};

const PAUSED_MEMBER = {
  processedPayments: ["invoice_abc"],
  stripeSubscriptionId: "sub_123",
  oneTimePackages: [],
  subscription: { isActive: false, status: "paused", startDate: new Date("2026-01-01") },
};

const FULLY_EXPIRED_EX_MEMBER = {
  // On subscription-deleted the webhook clears stripeSubscriptionId, so the only
  // durable evidence is processedPayments (never cleared on refund or cancel).
  processedPayments: ["invoice_abc"],
  oneTimePackages: [],
  subscription: { isActive: false, status: "canceled" },
};

const ONE_TIME_ONLY_BUYER = {
  processedPayments: ["pi_xyz"],
  oneTimePackages: [{ packageId: "apprentice", isActive: false, purchaseDate: new Date("2025-12-01") }],
  subscription: { isActive: false },
};

function testNeverPaidIsRefused() {
  assert.equal(hasEverPaid(NEVER_PAID_REGISTRANT), false, "a registered non-buyer has not paid");
  assert.equal(hasEverPaid(null), false, "null is not a payer");
  assert.equal(hasEverPaid(undefined), false, "undefined is not a payer");
  assert.equal(hasEverPaid({}), false, "an empty object is not a payer");
}

function testStripeCustomerIdIsNotEvidence() {
  // THE central trap. `stripeCustomerId` is set at registration, so any predicate
  // reading it treats ~44,400 never-paid accounts as customers. If someone adds
  // that leg, this fails.
  const registrantWithStripeCustomer = {
    ...NEVER_PAID_REGISTRANT,
    stripeCustomerId: "cus_realLookingButNeverCharged",
  };
  assert.equal(
    hasEverPaid(registrantWithStripeCustomer),
    false,
    "stripeCustomerId alone must NEVER count — register creates it before any payment"
  );
}

function testLapsedPayersStillCount() {
  // The expensive mistake in the other direction: gating on subscription.isActive
  // would exclude 4,613 real payers (38.5% of all payers), including past-due
  // members who still hold live draw entries and can win.
  assert.equal(hasEverPaid(PAST_DUE_MEMBER), true, "past_due member HAS paid");
  assert.equal(hasEverPaid(PAUSED_MEMBER), true, "paused member HAS paid");
  assert.equal(hasEverPaid(FULLY_EXPIRED_EX_MEMBER), true, "fully expired ex-member HAS paid");
  assert.equal(hasEverPaid(ONE_TIME_ONLY_BUYER), true, "one-time-pack buyer HAS paid");
  assert.equal(hasEverPaid(ACTIVE_MEMBER), true, "active member HAS paid");
}

function testWebhookRaceIsCovered() {
  // processedPayments is written asynchronously by the Stripe webhook. In the
  // seconds between checkout and that write, a genuine buyer must not be refused.
  const justSubscribed = { processedPayments: [], stripeSubscriptionId: "sub_fresh" };
  assert.equal(hasEverPaid(justSubscribed), true, "a live subscription id counts before the webhook lands");

  const justBoughtPack = {
    processedPayments: [],
    oneTimePackages: [{ packageId: "apprentice", isActive: true, purchaseDate: new Date() }],
  };
  assert.equal(hasEverPaid(justBoughtPack), true, "a pack row counts before the webhook lands");

  const startDateOnly = { processedPayments: [], subscription: { startDate: new Date() } };
  assert.equal(hasEverPaid(startDateOnly), true, "a subscription startDate counts before the webhook lands");
}

function testEmptyCollectionsAreNotEvidence() {
  // Guard against a truthiness slip: [] is truthy in JS, so `if (arr)` would
  // pass every never-paid account.
  assert.equal(hasEverPaid({ oneTimePackages: [] }), false, "an empty pack array is not a purchase");
  assert.equal(hasEverPaid({ processedPayments: [] }), false, "an empty payments array is not a purchase");
  assert.equal(hasEverPaid({ subscription: {} }), false, "a subscription with no startDate is not a purchase");
  assert.equal(hasEverPaid({ subscription: null }), false, "a null subscription is not a purchase");
  assert.equal(hasEverPaid({ stripeSubscriptionId: "" }), false, "an empty subscription id is not a purchase");
}

function run() {
  testNeverPaidIsRefused();
  testStripeCustomerIdIsNotEvidence();
  testLapsedPayersStillCount();
  testWebhookRaceIsCovered();
  testEmptyCollectionsAreNotEvidence();
  console.log("✅ has-ever-paid: all tests passed");
}

run();
