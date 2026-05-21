import assert from "node:assert/strict";
import type Stripe from "stripe";
import { paymentIntentIdsOnStripeInvoice } from "../stripe-invoice-payment-intents";

function testPaymentIntentIdsOnStripeInvoiceCollectsIds() {
  const inv = {
    id: "in_1",
    payment_intent: "pi_from_top",
    latest_payment_intent: "pi_from_latest",
    payments: {
      data: [
        {
          payment: {
            payment_intent: "pi_from_payments_array",
          },
        },
      ],
    },
  } as unknown as Stripe.Invoice;

  const ids = paymentIntentIdsOnStripeInvoice(inv);
  assert.deepEqual(
    new Set(ids),
    new Set(["pi_from_top", "pi_from_latest", "pi_from_payments_array"])
  );
}

function run() {
  testPaymentIntentIdsOnStripeInvoiceCollectsIds();
  console.log("refund-reversal tests passed");
}

run();
