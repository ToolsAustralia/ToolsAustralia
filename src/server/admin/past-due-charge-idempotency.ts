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
 * ⚠️ THE 24h IDEMPOTENCY-REPLAY TRAP — read before adding or changing any key below.
 *
 * Stripe RETAINS idempotency keys for 24 hours and, for ANY reuse within that
 * window, REPLAYS the cached response (response header `idempotent-replayed: true`)
 * WITHOUT re-attempting the charge. So a key that is stable across separate
 * admin/cron runs silently turns every run after the first (within 24h) into a
 * replay of the previous outcome: it logs the OLD result (e.g. `card_declined`)
 * and never actually re-charges the card. Our DB-side "recently attempted" guard
 * is only ${RECENT_ATTEMPT_WINDOW_HOURS}h (see above), so in the 6h–24h gap the
 * code DOES proceed to call Stripe — but Stripe replays. Worst case: a "failed"
 * row with no real charge attempt at all.
 *
 * Incident 2026-06-29: the daily bulk run reused `admin-charge-${invoiceId}` and
 * replayed 656/668 prior declines, collecting $0. See docs/CHARGE_PAST_DUE_CUSTOMERS.md.
 *
 * RULE: a key MUST vary whenever you intend a genuinely NEW charge attempt; it may
 * be stable ONLY across retries that must DEDUPE to a single charge (a resumed bulk
 * chunk re-touching the same invoice in the SAME run, or paying a freshly-created
 * recovery invoice once). Pick the builder that matches your dedupe unit:
 *   - same invoice charged across separate runs  → buildBulkChargeIdempotencyKey
 *   - same invoice re-charged per admin/user click → buildOneOffChargeIdempotencyKey
 *   - a brand-new invoice paid once (recovery)     → buildAdminChargeIdempotencyKey
 */

/**
 * Bulk chunked charge run. Stable within a run (so a resumed chunk that re-touches
 * an invoice dedupes to one charge), fresh across runs (so each daily run is a real
 * retry, not a Stripe replay). `runId` is the ChargeJobRun `_id`.
 */
export function buildBulkChargeIdempotencyKey(invoiceId: string, runId: string): string {
  return `admin-charge-${invoiceId}-run-${runId}`;
}

/**
 * One-off admin/user-initiated charge of an EXISTING invoice (the per-user "Charge"
 * button — a path with NO ChargeJobLock). The key is bucketed to a coarse time window
 * (`MIN_SECONDS_BETWEEN_ATTEMPTS`, 30s — aligned with the spam debounce), NOT a random
 * per-request token. This is deliberate and load-bearing:
 *   - Two TRULY-CONCURRENT submits of the same click (a double-click, or a
 *     proxy/load-balancer retry of a slow in-flight POST) fall in the same bucket →
 *     identical key → Stripe collapses them to ONE charge. A random-per-call key would
 *     give Stripe nothing to dedupe on (the in-process 30s debounce is a non-atomic
 *     read-then-act and does NOT serialize concurrent requests), risking a double-charge.
 *   - A deliberate retry 30s+ later lands in a new bucket → fresh key → real attempt,
 *     so it is NOT a 24h replay. (Within the same 30s the debounce already skips it.)
 * `nowMs` is injectable for tests; production passes the default `Date.now()`.
 */
export function buildOneOffChargeIdempotencyKey(invoiceId: string, nowMs: number = Date.now()): string {
  const bucket = Math.floor(nowMs / (MIN_SECONDS_BETWEEN_ATTEMPTS * 1000));
  return `admin-charge-${invoiceId}-once-${bucket}`;
}

/**
 * Stable-per-invoice key. ONLY for the recovery flow's pay step, on the held draft it
 * selects and finalizes per recovery. Stability is safe there — and does NOT hit the
 * 24h replay trap — because a finalized invoice leaves the draft pool (recovery only
 * selects `status: draft`), so a later recovery can't re-select and re-pay the same id,
 * and the 6h recent-recovery lock blocks fast retries. Do NOT use it for a path that
 * re-charges the SAME existing invoice across runs/clicks (bulk daily / per-user button)
 * — Stripe would replay it within 24h (see the trap note above); use the bulk/one-off
 * builders instead.
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

type ChargeLogRowForRecentCheck = {
  attemptedAt: Date;
  status?: "success" | "failed" | "skipped";
};

/**
 * Whether the default 1-per-window budget should skip this attempt.
 *
 * Returns false (proceed) when bypass=true — used by admin-initiated paths
 * (per-user charge button, manual recover endpoints) so explicit admin clicks
 * aren't gated by prior automated attempts. The 30s debounce check still fires
 * separately before this — bypass does NOT defeat double-click protection.
 *
 * Returns true (skip) when any prior row exists within the 6h window.
 */
export function shouldSkipForRecentAttempt(
  recentRows: ChargeLogRowForRecentCheck[],
  bypass: boolean
): boolean {
  if (bypass) return false;
  return recentRows.length > 0;
}
