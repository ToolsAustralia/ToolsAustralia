import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  decidePostPayAction,
  extractPaymentIntentId,
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

function run() {
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
