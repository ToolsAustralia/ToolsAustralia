import assert from "node:assert/strict";
import type Stripe from "stripe";

import {
  dropNonConfirmableInvoicePaymentIntent,
  isInvoicePayable,
  isPaymentIntentClientConfirmable,
  selectConfirmableInvoicePaymentIntent,
} from "../payment-intent-payable";

/**
 * Regression tests for PaymentIntent recovery on /api/stripe/pay-failed-invoice.
 *
 * Production bug (all 7 production 500s in the week to 2026-09-03, one member
 * retrying 7x in 16 minutes on 2026-09-02 and blocked every time):
 *
 *   stripe.invoices.pay() throws `invoice_payment_intent_requires_action` when the
 *   member's bank wants 3DS/SCA. That error carries NO top-level `payment_intent`,
 *   and its message says nothing about default payment methods — so the route's
 *   recovery step, which only fired when the message matched /default_payment_method/,
 *   was skipped. The ladder fell through to a 500 "Failed to initialize payment"
 *   while the invoice held a perfectly confirmable `requires_action` PI that the
 *   client (usePastDueResolve) already knows how to confirm.
 *
 * The route now recovers on STATE ("is there a confirmable PI?") rather than on error
 * phrasing, gated by classifyStripeInvoicePayInitFailure so a terminally-unpayable
 * invoice is never resurrected. These tests pin the two predicates that decision rests
 * on, and the one behavioural difference between them that makes the gate safe.
 */

function invoice(status: Stripe.Invoice.Status | null): Pick<Stripe.Invoice, "id" | "status"> {
  return { id: "in_test", status } as Pick<Stripe.Invoice, "id" | "status">;
}

function pi(status: Stripe.PaymentIntent.Status): Stripe.PaymentIntent {
  return { id: "pi_test", status } as Stripe.PaymentIntent;
}

function testIsInvoicePayable() {
  assert.equal(isInvoicePayable(invoice("open")), true, "open is payable");
  assert.equal(isInvoicePayable(invoice("draft")), true, "draft is payable");
  assert.equal(isInvoicePayable(invoice("void")), false, "void is not payable");
  assert.equal(isInvoicePayable(invoice("uncollectible")), false, "uncollectible is not payable");
  assert.equal(isInvoicePayable(invoice("paid")), false, "paid is not payable");
  assert.equal(isInvoicePayable(invoice(null)), false, "null status is not payable");
}

function testClientConfirmableStatuses() {
  // requires_action is the 3DS state. If this ever leaves the confirmable set the
  // production bug above comes straight back.
  assert.equal(
    isPaymentIntentClientConfirmable(pi("requires_action")),
    true,
    "requires_action (3DS) is client-confirmable — the whole point of the fix"
  );
  assert.equal(isPaymentIntentClientConfirmable(pi("requires_payment_method")), true, "decline/no-PM state is confirmable");
  assert.equal(isPaymentIntentClientConfirmable(pi("requires_confirmation")), true, "requires_confirmation is confirmable");
  assert.equal(isPaymentIntentClientConfirmable(pi("processing")), true, "processing is confirmable");
  assert.equal(isPaymentIntentClientConfirmable(pi("canceled")), false, "canceled is NOT confirmable");
  assert.equal(isPaymentIntentClientConfirmable(pi("succeeded")), false, "succeeded is NOT confirmable");
}

function testSelectConfirmableInvoicePaymentIntent() {
  // The bug case: open invoice + 3DS-pending PI must be handed back so the route's
  // terminal `requiresPaymentConfirmation` response can carry its client_secret.
  assert.equal(
    selectConfirmableInvoicePaymentIntent(invoice("open"), pi("requires_action"))?.id,
    "pi_test",
    "open invoice + requires_action PI → returned (3DS can proceed)"
  );

  // A void/uncollectible invoice must never yield a client_secret, whatever its stale
  // PI says. This is what makes broadening the recovery safe.
  assert.equal(
    selectConfirmableInvoicePaymentIntent(invoice("void"), pi("requires_action")),
    null,
    "void invoice → refused even though the PI status alone looks confirmable"
  );
  assert.equal(
    selectConfirmableInvoicePaymentIntent(invoice("uncollectible"), pi("requires_payment_method")),
    null,
    "uncollectible invoice → refused"
  );
  assert.equal(
    selectConfirmableInvoicePaymentIntent(invoice("paid"), pi("requires_action")),
    null,
    "paid invoice → refused (nothing left to collect)"
  );

  // A terminal PI on a live invoice is still refused.
  assert.equal(
    selectConfirmableInvoicePaymentIntent(invoice("open"), pi("canceled")),
    null,
    "open invoice + canceled PI → refused"
  );
  assert.equal(
    selectConfirmableInvoicePaymentIntent(invoice("open"), pi("succeeded")),
    null,
    "open invoice + succeeded PI → refused"
  );
  assert.equal(selectConfirmableInvoicePaymentIntent(invoice("open"), null), null, "no PI → null");
}

function testSelectDiffersFromDropOnNonPayableInvoices() {
  // These two are NOT interchangeable, and the difference is deliberate.
  //
  // `drop…` answers "may invoices.pay attach a FRESH PI?" — on a non-payable invoice
  // nothing downstream will collect, so it passes the PI through untouched.
  // `select…` answers "may this PI's client_secret go to the browser?" — there the
  // same input must be refused. Using `drop…` in the recovery path would have shipped
  // a void invoice's stale client_secret to a member.
  const voidInvoice = invoice("void");
  const stale = pi("requires_action");

  assert.equal(
    dropNonConfirmableInvoicePaymentIntent(voidInvoice, stale)?.id,
    "pi_test",
    "drop…: passes a PI through on a non-payable invoice (by design)"
  );
  assert.equal(
    selectConfirmableInvoicePaymentIntent(voidInvoice, stale),
    null,
    "select…: refuses the SAME input — this is the safety difference"
  );

  // On a payable invoice the two agree, which is why the open-invoice paths are unchanged.
  assert.equal(
    dropNonConfirmableInvoicePaymentIntent(invoice("open"), pi("canceled")),
    null,
    "drop…: still drops a canceled PI on an open invoice"
  );
  assert.equal(
    selectConfirmableInvoicePaymentIntent(invoice("open"), pi("canceled")),
    null,
    "select…: agrees on an open invoice"
  );
}

function run() {
  testIsInvoicePayable();
  testClientConfirmableStatuses();
  testSelectConfirmableInvoicePaymentIntent();
  testSelectDiffersFromDropOnNonPayableInvoices();
  console.log("invoice-payment-intent-recovery tests passed");
}

run();
