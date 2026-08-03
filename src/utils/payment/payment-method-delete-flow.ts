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
  // Copy is deliberately short: say what changes and what it costs, nothing else. Members
  // dismiss walls of text, and the consequence here is the whole point of the dialog.
  switch (kind) {
    case "billing-last":
      return {
        title: "Remove your only card?",
        message:
          "Your membership won't renew until you add a new card, and one-tap checkout will be turned off.",
        confirmText: "Remove card",
        requireCheckbox: {
          label: "I understand my membership won't renew until I add a new card.",
        },
      };
    case "billing-reassign":
      return {
        title: "Remove card used for renewals?",
        message: "Renewals will switch to another saved card on your account.",
        confirmText: "Remove card",
      };
    default:
      return {
        title: "Remove this card?",
        message: "You'll need to enter its details again next time you pay.",
        confirmText: "Remove",
      };
  }
}
