/**
 * Pure helper for deciding what to do after `stripe.invoices.pay()` returns.
 *
 * Empirically Stripe sometimes leaves the PI in `requires_confirmation` after
 * `invoices.pay()` — particularly when the invoice already had a PI from a
 * prior finalization attempt. The fix is to explicitly call `paymentIntents.confirm()`
 * to actually trigger the charge. This helper makes that decision pure/testable.
 */

import type Stripe from "stripe";

export type PostPayDecision =
  | { kind: "success" }
  | { kind: "needs_confirm"; piId: string }
  | { kind: "requires_authentication" }
  | { kind: "failed"; errorCode: string; errorMessage: string; declineCode?: string };

/**
 * Decide what to do after `stripe.invoices.pay()` based on the invoice's
 * final status and the associated PaymentIntent's state.
 *
 * Inputs assumed to be the LATEST values (re-fetched if needed by the caller).
 */
export function decidePostPayAction(
  invoice: Stripe.Invoice,
  paymentIntent: Stripe.PaymentIntent | null
): PostPayDecision {
  if (invoice.status === "paid") return { kind: "success" };

  if (!paymentIntent) {
    return {
      kind: "failed",
      errorCode: `invoice_${invoice.status ?? "unknown"}`,
      errorMessage: `Invoice status is "${invoice.status ?? "unknown"}" with no PaymentIntent`,
    };
  }

  switch (paymentIntent.status) {
    case "succeeded":
      // PI succeeded but invoice not yet paid — webhook race. Treat as success.
      return { kind: "success" };

    case "requires_confirmation":
      return { kind: "needs_confirm", piId: paymentIntent.id };

    case "requires_action":
      return { kind: "requires_authentication" };

    case "requires_payment_method":
      return {
        kind: "failed",
        errorCode: paymentIntent.last_payment_error?.code ?? "card_declined",
        declineCode: paymentIntent.last_payment_error?.decline_code,
        errorMessage:
          paymentIntent.last_payment_error?.message ?? "Payment method was declined",
      };

    case "canceled":
      return {
        kind: "failed",
        errorCode: "payment_intent_canceled",
        errorMessage: paymentIntent.cancellation_reason ?? "PaymentIntent was canceled",
      };

    case "processing":
      return {
        kind: "failed",
        errorCode: "payment_processing",
        errorMessage: "Payment is still processing; not yet settled",
      };

    default:
      return {
        kind: "failed",
        errorCode: `pi_${paymentIntent.status}`,
        errorMessage: `Unexpected PaymentIntent status: ${paymentIntent.status}`,
      };
  }
}

/** Extract the PaymentIntent id from an invoice's `payment_intent` field. */
export function extractPaymentIntentId(invoice: Stripe.Invoice): string | null {
  const inv = invoice as Stripe.Invoice & {
    payment_intent?: string | Stripe.PaymentIntent | null;
  };
  if (!inv.payment_intent) return null;
  if (typeof inv.payment_intent === "string") return inv.payment_intent;
  return inv.payment_intent.id ?? null;
}
