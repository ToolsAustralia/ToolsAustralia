import type Stripe from "stripe";

/**
 * Collect Stripe PaymentIntent ids referenced on an Invoice (top-level, latest, and Invoice Payments API rows).
 */
export function paymentIntentIdsOnStripeInvoice(inv: Stripe.Invoice): string[] {
  const typed = inv as Stripe.Invoice & {
    payment_intent?: string | Stripe.PaymentIntent | null;
    latest_payment_intent?: string | Stripe.PaymentIntent | null;
    payments?: {
      data?: Array<{
        payment?: {
          payment_intent?: string | Stripe.PaymentIntent | null;
        } | null;
      }>;
    };
  };
  const ids: string[] = [];
  if (typed.payment_intent) {
    ids.push(typeof typed.payment_intent === "string" ? typed.payment_intent : typed.payment_intent.id);
  }
  if (typed.latest_payment_intent) {
    ids.push(
      typeof typed.latest_payment_intent === "string"
        ? typed.latest_payment_intent
        : typed.latest_payment_intent.id
    );
  }
  for (const row of typed.payments?.data ?? []) {
    const pi = row?.payment?.payment_intent;
    if (pi) ids.push(typeof pi === "string" ? pi : pi.id);
  }
  return [...new Set(ids.filter(Boolean))];
}
