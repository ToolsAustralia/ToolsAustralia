/**
 * Stripe `last_payment_error.decline_code` values that indicate the issuer has
 * flagged the card as compromised. We never auto-allowlist these — adding them
 * to allowlist won't make charges succeed (issuer keeps declining) and ignores
 * a real fraud signal.
 */
export const FRAUD_SIGNAL_DECLINE_CODES = new Set<string>([
  "lost_card",
  "stolen_card",
  "pickup_card",
  "fraudulent",
]);

export function isFraudSignalDeclineCode(declineCode: string | null | undefined): boolean {
  if (!declineCode) return false;
  return FRAUD_SIGNAL_DECLINE_CODES.has(declineCode);
}

/**
 * Decline codes that mean the card has a permanent issue requiring customer
 * action (new card, correct CVC, etc.). Allowlisting these is harmless but
 * pointless — the issuer will keep declining. We skip them by default to
 * keep the allowlist clean (Account Updater doesn't help most of these,
 * and an admin can still override case-by-case).
 */
export const PERMANENT_ISSUE_DECLINE_CODES = new Set<string>([
  "expired_card",
  "incorrect_cvc",
  "invalid_account",
  // Stripe emits BOTH `incorrect_number` and `invalid_number`, and only the former ever
  // occurs here: measured 2026-07-31 against production `InvoiceChargeLog`, all-time
  // `incorrect_number` = 4,202 rows, `invalid_number` = 0. `incorrect_number` was the
  // single largest dead-card decline in the 28-31 Jul window (300 of 999) and was being
  // auto-allowlisted, which cannot help — a mistyped/reissued number keeps declining.
  // Keep `invalid_number` too; it is a real Stripe code and costs nothing to cover.
  "incorrect_number",
  "invalid_number",
  "invalid_expiry_year",
  "invalid_expiry_month",
]);

export function isPermanentIssueDeclineCode(declineCode: string | null | undefined): boolean {
  if (!declineCode) return false;
  return PERMANENT_ISSUE_DECLINE_CODES.has(declineCode);
}
