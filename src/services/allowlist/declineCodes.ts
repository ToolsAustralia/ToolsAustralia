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
  "invalid_number",
  "invalid_expiry_year",
  "invalid_expiry_month",
]);

export function isPermanentIssueDeclineCode(declineCode: string | null | undefined): boolean {
  if (!declineCode) return false;
  return PERMANENT_ISSUE_DECLINE_CODES.has(declineCode);
}
