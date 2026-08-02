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

/**
 * Stripe's two ways of saying "this invoice cannot be paid through `invoices.pay`" —
 * neither is a card decline, and neither reaches the issuer.
 *
 *  - "This invoice can no longer be paid" — every `invoice_payment`'s PaymentIntent was
 *    already canceled before the call.
 *  - `payment_intent_unexpected_state` — the invoice still carried an `open`
 *    `invoice_payment`, but its PaymentIntent could not be reused. Stripe cancels that PI
 *    *while processing our request* and then rejects the `payment_method` update on it
 *    (HTTP 400, `stripe-should-retry: false`).
 */
export function isInvoiceNotDirectlyPayableError(err: {
  code?: string | null;
  message?: string | null;
}): boolean {
  return (
    err.message?.toLowerCase().includes("no longer be paid") === true ||
    err.code === "payment_intent_unexpected_state"
  );
}

/** What a thrown `stripe.invoices.pay()` error means for the caller. */
export type PayFailureRoute = "awaiting_retry" | "needs_recovery" | "decline";

/**
 * Classify a thrown `stripe.invoices.pay()` error into what should happen next.
 *
 * The fork turns on `next_payment_attempt`, because "not directly payable" means two
 * very different things:
 *
 *  - retry SCHEDULED (`next_payment_attempt` set) → `awaiting_retry`. Stripe's own Smart
 *    Retry owns the invoice; stand down and record a skip, not a scary failure.
 *  - retry EXHAUSTED (`next_payment_attempt == null`) → `needs_recovery`. Stripe has given
 *    up; the invoice belongs in the stranded-recovery flow. Verified in production over
 *    28–31 Jul 2026: every invoice that threw `payment_intent_unexpected_state` here was
 *    already recovery-ELIGIBLE and WAS routed to recovery by the next day's run (5→5,
 *    209→209, 14→14 across three consecutive days) — one wasted member-day each time.
 *    Only callers that can act on it (`deferToCaller`) get this; everyone else keeps the
 *    historical `decline` row so no existing flow silently changes shape.
 *
 * Anything else is a real card decline.
 */
export function classifyPayFailureRoute(
  err: { code?: string | null; message?: string | null },
  invoice: { next_payment_attempt?: number | null },
  opts: { deferToCaller: boolean }
): PayFailureRoute {
  if (!isInvoiceNotDirectlyPayableError(err)) return "decline";
  if (invoice.next_payment_attempt != null) return "awaiting_retry";
  return opts.deferToCaller ? "needs_recovery" : "decline";
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
