/**
 * Pure helpers governing the admin-driven past-due charge cadence.
 *
 * Kept in their own module (no Stripe SDK imports) so they can be unit-tested
 * without `STRIPE_SECRET_KEY` being present in the environment.
 */

/**
 * Minimum interval between admin-driven charge attempts on the same Stripe invoice.
 * Re-attempting a card that just declined burns another Stripe decline fee, so we
 * gate every admin path through this window.
 */
export const RECENT_ATTEMPT_WINDOW_HOURS = 24;

/** Earliest `attemptedAt` that still counts as "recent" for skip-eligibility checks. */
export function cutoffForRecentAttempt(now: Date = new Date()): Date {
  return new Date(now.getTime() - RECENT_ATTEMPT_WINDOW_HOURS * 60 * 60 * 1000);
}

/**
 * Stripe idempotency key for admin-driven `invoices.pay`. Stable per invoice so a
 * rapid double-submit returns Stripe's cached first response instead of incurring a
 * second decline fee. Stripe expires idempotency keys after 24h, which matches the
 * DB-side `RECENT_ATTEMPT_WINDOW_HOURS` window — by the time a legitimate next-day
 * retry runs, both the DB skip and the Stripe cache have cleared.
 */
export function buildAdminChargeIdempotencyKey(invoiceId: string): string {
  return `admin-charge-${invoiceId}`;
}

/** Skip-reason value written to InvoiceChargeLog when the late re-check fires. */
export const SKIP_REASON_NO_LONGER_PAST_DUE = "no_longer_past_due" as const;

/**
 * Pure predicate gating the late `subscription.status` re-check inside
 * payOpenInvoiceAsPastDueAdmin. Returns true when the user is no longer
 * eligible for an admin-driven charge attempt.
 */
export function shouldSkipForNotPastDue(
  status: string | null | undefined
): boolean {
  if (!status) return true;
  return status.toLowerCase() !== "past_due";
}
