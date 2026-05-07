/**
 * Pure helpers governing the admin-driven past-due charge cadence and
 * the Force Charge per-path attempt budgets.
 *
 * Kept in their own module (no Stripe SDK imports) so they can be unit-tested
 * without `STRIPE_SECRET_KEY` being present in the environment.
 */

/**
 * Window for any attempt-counting on InvoiceChargeLog.
 * Tightened from 24h on 2026-05-06 to allow same-day human-driven retries
 * (Force Charge admin / user self-serve). Per-path budgets cap the worst case.
 */
export const RECENT_ATTEMPT_WINDOW_HOURS = 6;

/** Max attempts per 6h window for each Force Charge path (admin and user counted separately). */
export const MAX_FORCE_CHARGE_ATTEMPTS_PER_WINDOW = 3;

/** Minimum seconds between any two attempts on the same invoice (spam-click debounce). */
export const MIN_SECONDS_BETWEEN_ATTEMPTS = 30;

/** Earliest `attemptedAt` that still counts as "recent" for skip-eligibility checks. */
export function cutoffForRecentAttempt(now: Date = new Date()): Date {
  return new Date(now.getTime() - RECENT_ATTEMPT_WINDOW_HOURS * 60 * 60 * 1000);
}

/** Earliest `attemptedAt` that still counts as "too soon" for the debounce check. */
export function cutoffForDebounce(now: Date = new Date()): Date {
  return new Date(now.getTime() - MIN_SECONDS_BETWEEN_ATTEMPTS * 1000);
}

/**
 * Stripe idempotency key for admin-driven `invoices.pay`. Stable per invoice so a
 * rapid double-submit returns Stripe's cached first response. Used by bulk past-due
 * charger and the regular per-user admin retry — both are 1-per-window paths.
 */
export function buildAdminChargeIdempotencyKey(invoiceId: string): string {
  return `admin-charge-${invoiceId}`;
}

/**
 * Stripe idempotency key for Force Charge paths. Per-attempt within the 6h window
 * so each of the 3 allowed attempts hits Stripe fresh. Separate `triggeredBy`
 * namespaces keep admin and user budgets independent.
 */
export function buildForceChargeIdempotencyKey(
  invoiceId: string,
  triggeredBy: "admin" | "user",
  attemptNumber: number
): string {
  return `admin-charge-${invoiceId}-fc-${triggeredBy}-${attemptNumber}`;
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

type ChargeLogRowForBudget = {
  attemptedAt: Date;
  result?: unknown;
};

function extractTriggeredBy(result: unknown): "admin" | "user" | null {
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  const fc = record.forceCharge;
  if (!fc || typeof fc !== "object") return null;
  const triggered = (fc as Record<string, unknown>).triggeredBy;
  if (triggered === "admin" || triggered === "user") return triggered;
  return null;
}

/**
 * Count how many Force Charge attempts on this path have been made within the
 * 6h window. Admin and user paths are counted separately based on
 * `result.forceCharge.triggeredBy` (set by `forceChargeCurrentCycle` post-pay).
 */
export function countForceChargeAttempts(
  rows: ChargeLogRowForBudget[],
  triggeredBy: "admin" | "user",
  now: Date = new Date()
): number {
  const cutoff = cutoffForRecentAttempt(now);
  let count = 0;
  for (const row of rows) {
    if (row.attemptedAt < cutoff) continue;
    if (extractTriggeredBy(row.result) === triggeredBy) count++;
  }
  return count;
}

/**
 * Whether the per-path Force Charge budget for this 6h window is exhausted.
 * Returns true at >= MAX_FORCE_CHARGE_ATTEMPTS_PER_WINDOW prior attempts.
 */
export function hasForceChargeBudgetExhausted(
  rows: ChargeLogRowForBudget[],
  triggeredBy: "admin" | "user",
  now: Date = new Date()
): boolean {
  return countForceChargeAttempts(rows, triggeredBy, now) >= MAX_FORCE_CHARGE_ATTEMPTS_PER_WINDOW;
}

/**
 * Whether ANY attempt happened within the debounce window (default 30s). Used
 * uniformly across all paths to prevent spam-click double-submissions.
 */
export function isDebouncedTooSoon(
  rows: ChargeLogRowForBudget[],
  now: Date = new Date()
): boolean {
  const cutoff = cutoffForDebounce(now);
  return rows.some((row) => row.attemptedAt >= cutoff);
}
