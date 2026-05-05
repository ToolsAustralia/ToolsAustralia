import assert from "node:assert/strict";
import type Stripe from "stripe";
import { buildBlockedTransactionRecord } from "../blockedTransactionRepo";

// ---------- Fixture builders ----------

function makeCharge(overrides: Partial<Stripe.Charge> = {}): Stripe.Charge {
  return {
    id: "ch_test_1",
    payment_method_details: {
      card: {
        fingerprint: "fp_test_1",
        last4: "4242",
        brand: "visa",
      },
    },
    outcome: {
      type: "blocked",
      network_status: "not_sent_to_network",
      reason: "highest_risk_level",
    },
    billing_details: { email: "billing@example.com" },
    ...overrides,
  } as unknown as Stripe.Charge;
}

function makePI(overrides: Partial<Stripe.PaymentIntent> = {}): Stripe.PaymentIntent {
  return {
    id: "pi_test_1",
    customer: "cus_test_1",
    receipt_email: null,
    last_payment_error: { decline_code: "do_not_honor", code: "card_declined" },
    amount: 1999,
    currency: "aud",
    created: 1_700_000_000, // 2023-11-14T22:13:20Z
    ...overrides,
  } as unknown as Stripe.PaymentIntent;
}

// ---------- Tests ----------

function testReturnsRecordForBlockedOutcome() {
  const record = buildBlockedTransactionRecord(makePI(), makeCharge());
  assert.notEqual(record, null, "blocked outcome must produce a record");
  if (!record) return;
  assert.equal(record.paymentIntentId, "pi_test_1");
  assert.equal(record.chargeId, "ch_test_1");
  assert.equal(record.cardFingerprint, "fp_test_1");
  assert.equal(record.cardLast4, "4242");
  assert.equal(record.cardBrand, "visa");
  assert.equal(record.stripeCustomerId, "cus_test_1");
  assert.equal(record.declineCode, "do_not_honor");
  assert.equal(record.failureCode, "card_declined");
  assert.equal(record.outcomeType, "blocked");
  assert.equal(record.amount, 1999);
  assert.equal(record.currency, "aud");
  assert.equal(record.createdAt.getTime(), 1_700_000_000_000);
}

function testReturnsNullForIssuerDeclined() {
  // `network_status: "declined_by_network"` covers every normal issuer
  // decline — these are NOT Stripe-side blocks and must not enter the
  // BlockedTransaction collection. The Stripe Dashboard's "Blocked" filter
  // also excludes them; we match that semantics.
  const charge = makeCharge({
    outcome: {
      type: "issuer_declined",
      network_status: "declined_by_network",
      reason: "generic_decline",
    } as Stripe.Charge.Outcome,
  });
  const record = buildBlockedTransactionRecord(makePI(), charge);
  assert.equal(record, null, "issuer-declined-but-not-Stripe-blocked must return null");
}

function testReturnsRecordForBlockedNotSentToNetwork() {
  // The canonical Stripe auto-block shape: outcome.type=blocked AND
  // network_status=not_sent_to_network (because Stripe didn't even contact
  // the issuer). Must qualify.
  const charge = makeCharge({
    outcome: {
      type: "blocked",
      network_status: "not_sent_to_network",
      reason: "highest_risk_level",
    } as Stripe.Charge.Outcome,
  });
  const record = buildBlockedTransactionRecord(makePI(), charge);
  assert.notEqual(record, null, "Stripe-side block must produce a record");
}

function testReturnsNullForNonBlockedOutcome() {
  const charge = makeCharge({
    outcome: {
      type: "authorized",
      network_status: "approved_by_network",
    } as Stripe.Charge.Outcome,
  });
  const record = buildBlockedTransactionRecord(makePI(), charge);
  assert.equal(record, null, "non-blocked outcome must return null");
}

function testReturnsNullWhenFingerprintMissing() {
  const charge = makeCharge({
    payment_method_details: {
      card: { last4: "4242", brand: "visa" },
    } as Stripe.Charge.PaymentMethodDetails,
  });
  const record = buildBlockedTransactionRecord(makePI(), charge);
  assert.equal(record, null, "no fingerprint = no row (cannot allowlist what we cannot identify)");
}

function testReturnsNullWhenCardMissing() {
  const charge = makeCharge({ payment_method_details: null });
  const record = buildBlockedTransactionRecord(makePI(), charge);
  assert.equal(record, null);
}

function testFallsBackToBillingEmailWhenReceiptEmailMissing() {
  const record = buildBlockedTransactionRecord(
    makePI({ receipt_email: null }),
    makeCharge({ billing_details: { email: "fallback@example.com" } as Stripe.Charge.BillingDetails })
  );
  assert.equal(record?.customerEmail, "fallback@example.com");
}

function testPrefersReceiptEmailOverBilling() {
  const record = buildBlockedTransactionRecord(
    makePI({ receipt_email: "receipt@example.com" }),
    makeCharge({ billing_details: { email: "billing@example.com" } as Stripe.Charge.BillingDetails })
  );
  assert.equal(record?.customerEmail, "receipt@example.com");
}

function testHandlesObjectCustomer() {
  const record = buildBlockedTransactionRecord(
    makePI({ customer: { id: "cus_obj_1" } as Stripe.Customer }),
    makeCharge()
  );
  assert.equal(record?.stripeCustomerId, "cus_obj_1");
}

function testHandlesNullCustomer() {
  const record = buildBlockedTransactionRecord(
    makePI({ customer: null }),
    makeCharge()
  );
  assert.equal(record?.stripeCustomerId, null);
}

function testCapturesRawOutcomeForForensics() {
  const outcome = {
    type: "blocked",
    network_status: "not_sent_to_network",
    reason: "elevated_risk_level",
    rule: { id: "rule_xyz", action: "block" },
  } as unknown as Stripe.Charge.Outcome;
  const record = buildBlockedTransactionRecord(
    makePI(),
    makeCharge({ outcome })
  );
  assert.deepEqual(record?.rawOutcome, outcome, "rawOutcome must round-trip the full outcome object");
}

function run() {
  testReturnsRecordForBlockedOutcome();
  testReturnsRecordForBlockedNotSentToNetwork();
  testReturnsNullForIssuerDeclined();
  testReturnsNullForNonBlockedOutcome();
  testReturnsNullWhenFingerprintMissing();
  testReturnsNullWhenCardMissing();
  testFallsBackToBillingEmailWhenReceiptEmailMissing();
  testPrefersReceiptEmailOverBilling();
  testHandlesObjectCustomer();
  testHandlesNullCustomer();
  testCapturesRawOutcomeForForensics();
  console.log("blockedTransactionRepo tests passed");
}

run();
