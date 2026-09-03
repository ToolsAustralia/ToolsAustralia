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
 * Invoice states money can still be collected from. Matches the `invoice_not_payable`
 * failure code the API already returns for everything else (paid / void / uncollectible).
 */
const PAYABLE_INVOICE_STATUSES: Stripe.Invoice.Status[] = ["open", "draft"];

export function isInvoicePayable(invoice: Pick<Stripe.Invoice, "status">): boolean {
  return invoice.status !== null && PAYABLE_INVOICE_STATUSES.includes(invoice.status);
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
  if (isInvoicePayable(invoice) && !isPaymentIntentClientConfirmable(pi)) {
    console.warn(
      `[invoice-collection] Dropping non-confirmable PaymentIntent ${pi.id} (status=${pi.status}) for invoice ${invoice.id}`
    );
    return null;
  }
  return pi;
}

/**
 * Positive counterpart to `dropNonConfirmableInvoicePaymentIntent`, for the RECOVERY path:
 * hand back a PaymentIntent only when the client can actually confirm it.
 *
 * The two differ on non-payable invoices, and that difference is the whole point. `drop…`
 * exists to decide whether `invoices.pay` may attach a FRESH PI, so it deliberately passes a
 * PI through untouched on a void/uncollectible invoice — nothing downstream will collect on
 * it. This function is the opposite question: its result is handed to the browser as a
 * `client_secret` to confirm, so a void invoice's stale PI must be refused, not passed on.
 *
 * Callers MUST pass the FRESHLY RETRIEVED invoice. Judging a recovered PI against a cached
 * copy reintroduces exactly the staleness this guard exists to catch.
 */
export function selectConfirmableInvoicePaymentIntent(
  invoice: Pick<Stripe.Invoice, "id" | "status">,
  pi: Stripe.PaymentIntent | null
): Stripe.PaymentIntent | null {
  if (!pi) return null;
  if (!isInvoicePayable(invoice)) {
    console.warn(
      `[invoice-collection] Refusing PaymentIntent ${pi.id} for non-payable invoice ${invoice.id} (status=${invoice.status})`
    );
    return null;
  }
  if (!isPaymentIntentClientConfirmable(pi)) {
    console.warn(
      `[invoice-collection] Refusing non-confirmable PaymentIntent ${pi.id} (status=${pi.status}) for invoice ${invoice.id}`
    );
    return null;
  }
  return pi;
}
