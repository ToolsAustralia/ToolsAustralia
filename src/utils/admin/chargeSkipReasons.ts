/**
 * Pure, dependency-free skip-reason vocabulary for the bulk past-due charge flows.
 *
 * Shared by the server totals aggregator (`charge-past-due-totals.ts`), the run
 * bucketer (`chargePastDueJob.ts` → `recomputeTotalsFromLogs`), and the admin
 * run-detail drawer, so all three agree on the SAME buckets + labels. No Stripe /
 * Mongoose imports — safe to import from the client.
 *
 * `attemptSpacing` was added 2026-08-24 with the proactive per-invoice attempt cap:
 *  - `attemptSpacing` — the automated run submitted this card to Stripe less than
 *                      BULK_ATTEMPT_SPACING_DAYS ago, so it sits this run out. This is
 *                      the PROACTIVE cap (see past-due-charge-idempotency.ts); it is a
 *                      different rule from `excessiveRetryCooldown` (REACTIVE, engages
 *                      only after Stripe has already blocked the card) and from
 *                      `recentlyAttempted` (the 6h human-retry window).
 *
 * Two new named buckets were added 2026-07-20 so the admin SKIP BREAKDOWN stops
 * dumping everything into "Other":
 *  - `noHeldDraft`   — a stranded past-due member with no re-billable held draft yet
 *                      (their next billing cycle hasn't minted one — see
 *                      docs/CHARGE_PAST_DUE_CUSTOMERS.md). Self-heals next cycle.
 *  - `awaitingRetry` — `invoices.pay()` had no payable attempt right now BUT Stripe
 *                      still has a scheduled retry (`next_payment_attempt` set). Not a
 *                      decline; Stripe auto-retries.
 */

export type SkipBucketKey =
  | "attemptSpacing"
  | "excessiveRetryCooldown"
  | "noHeldDraft"
  | "awaitingRetry"
  | "recentlyAttempted"
  | "noLongerPastDue"
  | "alreadyPaid"
  | "missingPaymentMethod"
  | "other";

/** Human labels for each bucket (admin UI). */
export const SKIP_BUCKET_LABELS: Record<SkipBucketKey, string> = {
  // No day count here ON PURPOSE. `chargeSkipReasons.ts` is the dependency-free,
  // client-safe vocabulary module, so it cannot import the policy constant
  // (`BULK_ATTEMPT_SPACING_DAYS` lives under src/server/) without inverting the
  // repo's layering for a label string. Hardcoding the number instead would let the
  // label lie the moment the constant changes. The concrete window IS interpolated
  // from the constant — in the per-row message, which is where an admin reads the
  // actual dates ("last submitted ... eligible again ...").
  attemptSpacing: "Spaced out (attempt cap)",
  excessiveRetryCooldown: "Retry in 3 days",
  noHeldDraft: "No held draft (stranded)",
  awaitingRetry: "Awaiting Stripe retry",
  recentlyAttempted: "Recently attempted (6h)",
  noLongerPastDue: "No longer past due",
  alreadyPaid: "Already paid",
  missingPaymentMethod: "Missing payment method",
  other: "Other",
};

/** Display order — most-common / most-actionable first. */
export const SKIP_BUCKET_ORDER: SkipBucketKey[] = [
  "attemptSpacing",
  "excessiveRetryCooldown",
  "noHeldDraft",
  "awaitingRetry",
  "recentlyAttempted",
  "noLongerPastDue",
  "alreadyPaid",
  "missingPaymentMethod",
  "other",
];

/** Canonical `skipReason` discriminant strings that map to a named bucket. */
export const KNOWN_SKIP_REASONS = new Set<string>([
  "attempt_spacing",
  "excessive_retry_cooldown",
  "no_held_draft",
  "awaiting_retry",
  "recently_attempted",
  "no_longer_past_due",
  "already_paid",
  "missing_payment_method",
]);

/** Map a canonical `skipReason` string → bucket key. Unknown / undefined → "other". */
export function skipReasonToBucket(reason: string | undefined | null): SkipBucketKey {
  switch (reason) {
    case "attempt_spacing":
      return "attemptSpacing";
    case "excessive_retry_cooldown":
      return "excessiveRetryCooldown";
    case "no_held_draft":
      return "noHeldDraft";
    case "awaiting_retry":
      return "awaitingRetry";
    case "recently_attempted":
      return "recentlyAttempted";
    case "no_longer_past_due":
      return "noLongerPastDue";
    case "already_paid":
      return "alreadyPaid";
    case "missing_payment_method":
      return "missingPaymentMethod";
    default:
      return "other";
  }
}

/**
 * Best-effort classify a persisted `InvoiceChargeLog` skip row's `errorMessage` back
 * to a canonical `skipReason`. Used when reconstructing totals from logs (server) and
 * to bucket rows client-side (drawer), so both re-derive the same buckets. Order
 * matters — most-specific phrases first.
 */
export function classifySkipReasonFromMessage(errorMessage?: string | null): string | undefined {
  if (!errorMessage) return undefined;
  const m = errorMessage.toLowerCase();
  // FIRST, ahead of every other branch. Without it the attempt-spacing message falls
  // through every test and lands in `other` — and it is the LARGEST bucket in every
  // automated run, so that alone would make the SKIP BREAKDOWN unreadable. Ordering it
  // first also makes it immune to rewording: the message names a prior attempt time, so
  // a future edit containing "within" or "prior attempt" would otherwise be claimed by
  // `recently_attempted` below — a different rule (the 6h HUMAN-retry window) that means
  // something else entirely to an operator.
  if (m.includes("attempt_spacing")) return "attempt_spacing";
  // Most specific first: this phrase also contains "retry", which the
  // awaiting_retry branch below would otherwise claim.
  if (m.includes("excessive_retry_cooldown") || m.includes("retry in 3 days")) {
    return "excessive_retry_cooldown";
  }
  if (m.includes("no held draft") || m.includes("no_held_draft")) return "no_held_draft";
  if (
    m.includes("retry scheduled") ||
    m.includes("scheduled retry") ||
    m.includes("auto-retry") ||
    m.includes("awaiting_retry")
  ) {
    return "awaiting_retry";
  }
  if (m.includes("already paid") || m.includes("already_paid")) return "already_paid";
  if (m.includes("no longer past_due") || m.includes("not past_due") || m.includes("no_longer_past_due")) {
    return "no_longer_past_due";
  }
  if (m.includes("payment method")) return "missing_payment_method";
  if (
    m.includes("within") ||
    m.includes("debounce") ||
    m.includes("recently_attempted") ||
    m.includes("prior attempt")
  ) {
    return "recently_attempted";
  }
  return undefined; // → "other"
}

/** One-shot: a skip row's `errorMessage` → bucket key. */
export function classifySkipBucketFromMessage(errorMessage?: string | null): SkipBucketKey {
  return skipReasonToBucket(classifySkipReasonFromMessage(errorMessage));
}
