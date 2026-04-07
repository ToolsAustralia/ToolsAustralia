/**
 * PaymentIntent states that allow Payment Element / confirmPayment or confirmCardPayment.
 * Canceled / succeeded must never be sent to the client as a payable client_secret.
 */

import type Stripe from "stripe";

const CLIENT_CONFIRMABLE_STATUSES: Stripe.PaymentIntent.Status[] = [
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
];

export function isPaymentIntentClientConfirmable(pi: Pick<Stripe.PaymentIntent, "status">): boolean {
  return CLIENT_CONFIRMABLE_STATUSES.includes(pi.status);
}

/** Terminal PI states that cannot be collected again on the same object. */
export function isPaymentIntentTerminalUnusableStatus(status: Stripe.PaymentIntent.Status): boolean {
  return status === "canceled" || status === "succeeded";
}

/**
 * Open/draft invoices may still reference a canceled PaymentIntent; treat as absent so
 * invoices.pay can attach a fresh PI.
 */
export function dropNonConfirmableInvoicePaymentIntent(
  invoice: Pick<Stripe.Invoice, "id" | "status">,
  pi: Stripe.PaymentIntent | null
): Stripe.PaymentIntent | null {
  if (!pi) return null;
  const { status: invStatus } = invoice;
  if ((invStatus === "open" || invStatus === "draft") && !isPaymentIntentClientConfirmable(pi)) {
    console.warn(
      `[invoice-collection] Dropping non-confirmable PaymentIntent ${pi.id} (status=${pi.status}) for invoice ${invoice.id}`
    );
    return null;
  }
  return pi;
}
