/**
 * Static map of Stripe `last_payment_error.decline_code` values to human
 * labels + their bucket. Used by the admin Blocked Transactions filter UI
 * to populate the multi-select option list and group rendering.
 *
 * Source: superset of Stripe's documented decline codes plus the project's
 * FRAUD_SIGNAL_DECLINE_CODES and PERMANENT_ISSUE_DECLINE_CODES (kept in
 * lockstep semantically — if you add a code here marked "fraud" or
 * "permanent", the corresponding set in src/services/allowlist/declineCodes.ts
 * is the actual filter source-of-truth; this map is purely UI labeling).
 *
 * If Stripe adds new codes, append them here; the filter UI is a static
 * dropdown so unknown codes from the data wouldn't render an option.
 */
export type DeclineGroup = "recoverable" | "fraud" | "permanent" | "other";

export const DECLINE_CODE_LABELS: Record<
  string,
  { label: string; group: DeclineGroup }
> = {
  // Recoverable — issuer may approve on retry
  generic_decline: { label: "Generic decline", group: "recoverable" },
  do_not_honor: { label: "Do not honor", group: "recoverable" },
  insufficient_funds: { label: "Insufficient funds", group: "recoverable" },
  try_again_later: { label: "Try again later", group: "recoverable" },
  processing_error: { label: "Processing error", group: "recoverable" },
  card_velocity_exceeded: { label: "Card velocity exceeded", group: "recoverable" },
  call_issuer: { label: "Call issuer", group: "recoverable" },
  service_not_allowed: { label: "Service not allowed", group: "recoverable" },
  transaction_not_allowed: { label: "Transaction not allowed", group: "recoverable" },

  // Fraud signals — never auto-allowlisted
  lost_card: { label: "Lost card", group: "fraud" },
  stolen_card: { label: "Stolen card", group: "fraud" },
  pickup_card: { label: "Pickup card", group: "fraud" },
  fraudulent: { label: "Fraudulent", group: "fraud" },

  // Permanent issues — pointless to allowlist
  expired_card: { label: "Expired card", group: "permanent" },
  incorrect_cvc: { label: "Incorrect CVC", group: "permanent" },
  invalid_account: { label: "Invalid account", group: "permanent" },
  invalid_number: { label: "Invalid card number", group: "permanent" },
  invalid_expiry_year: { label: "Invalid expiry year", group: "permanent" },
  invalid_expiry_month: { label: "Invalid expiry month", group: "permanent" },

  // Other
  authentication_required: { label: "Authentication required (3DS)", group: "other" },
  card_declined: { label: "Card declined (no specific reason)", group: "other" },
};

/**
 * Returns the label for a code, or the raw code if unknown. Used in table
 * cells to keep new-from-Stripe codes visible until added to the map.
 */
export function getDeclineCodeLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return DECLINE_CODE_LABELS[code]?.label ?? code;
}
