import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  classifyPayFailureRoute,
  decidePostPayAction,
  extractPaymentIntentId,
  isInvoiceNotDirectlyPayableError,
} from "../chargePastDuePostPayPolicy";

function testInvoicePaidIsSuccess() {
  const inv = { status: "paid" } as Stripe.Invoice;
  assert.deepEqual(decidePostPayAction(inv, null), { kind: "success" });
}

function testPiSucceededIsSuccess() {
  const inv = { status: "open" } as Stripe.Invoice;
  const pi = { id: "pi_x", status: "succeeded" } as Stripe.PaymentIntent;
  assert.deepEqual(decidePostPayAction(inv, pi), { kind: "success" });
}

function testRequiresConfirmationNeedsConfirm() {
  const inv = { status: "open" } as Stripe.Invoice;
  const pi = { id: "pi_x", status: "requires_confirmation" } as Stripe.PaymentIntent;
  const decision = decidePostPayAction(inv, pi);
  assert.equal(decision.kind, "needs_confirm");
  if (decision.kind === "needs_confirm") {
    assert.equal(decision.piId, "pi_x");
  }
}

function testRequiresActionIsAuthentication() {
  const inv = { status: "open" } as Stripe.Invoice;
  const pi = { id: "pi_x", status: "requires_action" } as Stripe.PaymentIntent;
  assert.deepEqual(decidePostPayAction(inv, pi), { kind: "requires_authentication" });
}

function testRequiresPaymentMethodFailed() {
  const inv = { status: "open" } as Stripe.Invoice;
  const pi = {
    id: "pi_x",
    status: "requires_payment_method",
    last_payment_error: { code: "card_declined", message: "Your card was declined" },
  } as unknown as Stripe.PaymentIntent;
  const decision = decidePostPayAction(inv, pi);
  assert.equal(decision.kind, "failed");
  if (decision.kind === "failed") {
    assert.equal(decision.errorCode, "card_declined");
    assert.equal(decision.errorMessage, "Your card was declined");
  }
}

function testRequiresPaymentMethodNoErrorFallsBack() {
  const inv = { status: "open" } as Stripe.Invoice;
  const pi = { id: "pi_x", status: "requires_payment_method" } as Stripe.PaymentIntent;
  const decision = decidePostPayAction(inv, pi);
  assert.equal(decision.kind, "failed");
  if (decision.kind === "failed") {
    assert.equal(decision.errorCode, "card_declined");
  }
}

function testCanceledFailed() {
  const inv = { status: "open" } as Stripe.Invoice;
  const pi = {
    id: "pi_x",
    status: "canceled",
    cancellation_reason: "abandoned",
  } as unknown as Stripe.PaymentIntent;
  const decision = decidePostPayAction(inv, pi);
  assert.equal(decision.kind, "failed");
  if (decision.kind === "failed") {
    assert.equal(decision.errorCode, "payment_intent_canceled");
    assert.equal(decision.errorMessage, "abandoned");
  }
}

function testProcessingFailed() {
  const inv = { status: "open" } as Stripe.Invoice;
  const pi = { id: "pi_x", status: "processing" } as Stripe.PaymentIntent;
  const decision = decidePostPayAction(inv, pi);
  assert.equal(decision.kind, "failed");
  if (decision.kind === "failed") {
    assert.equal(decision.errorCode, "payment_processing");
  }
}

function testInvoiceOpenNoPiFailed() {
  const inv = { status: "open" } as Stripe.Invoice;
  const decision = decidePostPayAction(inv, null);
  assert.equal(decision.kind, "failed");
  if (decision.kind === "failed") {
    assert.equal(decision.errorCode, "invoice_open");
  }
}

function testExtractPiIdFromString() {
  const inv = { payment_intent: "pi_abc" } as unknown as Stripe.Invoice;
  assert.equal(extractPaymentIntentId(inv), "pi_abc");
}

function testExtractPiIdFromObject() {
  const inv = {
    payment_intent: { id: "pi_xyz", status: "succeeded" },
  } as unknown as Stripe.Invoice;
  assert.equal(extractPaymentIntentId(inv), "pi_xyz");
}

function testExtractPiIdFromNull() {
  const inv = {} as Stripe.Invoice;
  assert.equal(extractPaymentIntentId(inv), null);
}

function testRequiresPaymentMethodPropagatesDeclineCode() {
  const decision = decidePostPayAction(
    { status: "open" } as Stripe.Invoice,
    {
      id: "pi_x",
      status: "requires_payment_method",
      last_payment_error: {
        code: "card_declined",
        decline_code: "do_not_honor",
        message: "Your card was declined.",
      },
    } as unknown as Stripe.PaymentIntent
  );
  assert.equal(decision.kind, "failed");
  if (decision.kind !== "failed") return;
  assert.equal(decision.errorCode, "card_declined");
  assert.equal(decision.declineCode, "do_not_honor");
  assert.equal(decision.errorMessage, "Your card was declined.");
}

// ─── classifyPayFailureRoute (thrown invoices.pay errors) ────────────────────
//
// Regression cover for the 245 `payment_intent_unexpected_state` "failures" measured
// over 28–31 Jul 2026: charges that never reached an issuer because the invoice was
// stranded but still carried a stale `open` invoice_payment. See docs/admin/.

const PIUS = {
  code: "payment_intent_unexpected_state",
  message:
    "This PaymentIntent's payment_method could not be updated because it has a status of canceled.",
};
const NO_LONGER_PAYABLE = { code: "invoice_payment_intent_requires_action", message: "This invoice can no longer be paid" };
const REAL_DECLINE = { code: "card_declined", message: "Your card has insufficient funds." };

function testUnpayableErrorDetection() {
  assert.equal(isInvoiceNotDirectlyPayableError(PIUS), true);
  assert.equal(isInvoiceNotDirectlyPayableError(NO_LONGER_PAYABLE), true);
  // case-insensitive on the message form
  assert.equal(isInvoiceNotDirectlyPayableError({ message: "This Invoice Can No Longer Be Paid" }), true);
  assert.equal(isInvoiceNotDirectlyPayableError(REAL_DECLINE), false);
  assert.equal(isInvoiceNotDirectlyPayableError({}), false);
}

function testRealDeclineIsAlwaysDecline() {
  // A genuine card decline must never be re-routed, whatever the retry state.
  for (const npa of [null, 1_700_000_000]) {
    for (const deferToCaller of [true, false]) {
      assert.equal(
        classifyPayFailureRoute(REAL_DECLINE, { next_payment_attempt: npa }, { deferToCaller }),
        "decline"
      );
    }
  }
}

function testRetryScheduledStandsDownRegardlessOfDeferral() {
  // Stripe still owns the invoice — skip, never recover (recovery would void an
  // invoice Stripe is about to retry).
  for (const deferToCaller of [true, false]) {
    assert.equal(
      classifyPayFailureRoute(PIUS, { next_payment_attempt: 1_700_000_000 }, { deferToCaller }),
      "awaiting_retry"
    );
    assert.equal(
      classifyPayFailureRoute(NO_LONGER_PAYABLE, { next_payment_attempt: 1_700_000_000 }, { deferToCaller }),
      "awaiting_retry"
    );
  }
}

function testExhaustedAndDeferrableRoutesToRecovery() {
  // THE BUG: exhausted (Stripe gave up) + not directly payable → recover in THIS run.
  assert.equal(
    classifyPayFailureRoute(PIUS, { next_payment_attempt: null }, { deferToCaller: true }),
    "needs_recovery"
  );
  assert.equal(
    classifyPayFailureRoute(NO_LONGER_PAYABLE, { next_payment_attempt: null }, { deferToCaller: true }),
    "needs_recovery"
  );
  // `next_payment_attempt` absent entirely is the same as null.
  assert.equal(
    classifyPayFailureRoute(PIUS, {}, { deferToCaller: true }),
    "needs_recovery"
  );
}

function testExhaustedWithoutDeferralKeepsLegacyDeclineRow() {
  // Callers that cannot act on the signal (per-user admin click, Force Charge,
  // recovery's own pay) must keep their historical `failed` row.
  assert.equal(
    classifyPayFailureRoute(PIUS, { next_payment_attempt: null }, { deferToCaller: false }),
    "decline"
  );
}

function run() {
  testUnpayableErrorDetection();
  testRealDeclineIsAlwaysDecline();
  testRetryScheduledStandsDownRegardlessOfDeferral();
  testExhaustedAndDeferrableRoutesToRecovery();
  testExhaustedWithoutDeferralKeepsLegacyDeclineRow();
  testInvoicePaidIsSuccess();
  testPiSucceededIsSuccess();
  testRequiresConfirmationNeedsConfirm();
  testRequiresActionIsAuthentication();
  testRequiresPaymentMethodFailed();
  testRequiresPaymentMethodNoErrorFallsBack();
  testCanceledFailed();
  testProcessingFailed();
  testInvoiceOpenNoPiFailed();
  testExtractPiIdFromString();
  testExtractPiIdFromObject();
  testExtractPiIdFromNull();
  testRequiresPaymentMethodPropagatesDeclineCode();
  console.log("chargePastDuePostPayPolicy tests passed");
}

run();
