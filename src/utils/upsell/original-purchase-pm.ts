import type Stripe from "stripe";

/** Extract Stripe PM id + display fields from a PaymentIntent (e.g. after confirmPayment). */
export function upsellPmFieldsFromPaymentIntent(
  paymentIntent: Pick<Stripe.PaymentIntent, "payment_method"> | null | undefined
): { paymentMethodId?: string; cardLast4?: string; cardBrand?: string } {
  const pm = paymentIntent?.payment_method;
  if (!pm) return {};
  if (typeof pm === "string") {
    return { paymentMethodId: pm };
  }
  const card = pm.type === "card" ? pm.card : null;
  return {
    paymentMethodId: pm.id,
    ...(card?.last4 ? { cardLast4: card.last4 } : {}),
    ...(card?.brand ? { cardBrand: card.brand } : {}),
  };
}
