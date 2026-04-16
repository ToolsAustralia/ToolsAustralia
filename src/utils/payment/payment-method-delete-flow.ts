import type { SavedPaymentMethod } from "@/hooks/queries";

export type PaymentMethodDeleteFlowKind = "simple" | "billing-reassign" | "billing-last";

/**
 * Determines which confirmation UX to show before removing a saved payment method.
 */
export function getPaymentMethodDeleteFlowKind(
  paymentMethodId: string,
  paymentMethods: SavedPaymentMethod[],
  subscriptionDefaultPaymentMethodId: string | null,
  hasActiveSubscription: boolean
): PaymentMethodDeleteFlowKind {
  const isBilling =
    Boolean(hasActiveSubscription) && subscriptionDefaultPaymentMethodId === paymentMethodId;
  if (!isBilling) {
    return "simple";
  }
  if (paymentMethods.length <= 1) {
    return "billing-last";
  }
  return "billing-reassign";
}

export function getPaymentMethodDeleteMessages(kind: PaymentMethodDeleteFlowKind): {
  title: string;
  message: string;
  confirmText: string;
  requireCheckbox?: { label: string };
} {
  switch (kind) {
    case "billing-last":
      return {
        title: "Remove subscription payment method",
        message:
          "This is the only saved card on your account and is used for membership renewals. Removing it will stop automatic renewals until you add a new payment method. One-off purchases may also require you to enter card details again.",
        confirmText: "Remove card",
        requireCheckbox: {
          label:
            "I understand automatic renewals may fail until I add a new payment method, and I want to remove this card.",
        },
      };
    case "billing-reassign":
      return {
        title: "Remove card used for renewals",
        message:
          "This payment method is currently used for subscription renewals. After you remove it, renewals will charge another saved card on your account.",
        confirmText: "Remove card",
      };
    default:
      return {
        title: "Remove payment method",
        message:
          "This card will be removed from your saved methods and detached from your Stripe customer record.",
        confirmText: "Remove",
      };
  }
}
