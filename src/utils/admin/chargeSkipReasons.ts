/**
 * Pure, dependency-free skip-reason vocabulary for the bulk past-due charge flows.
 *
 * Shared by the server totals aggregator (`charge-past-due-totals.ts`), the run
 * bucketer (`chargePastDueJob.ts` → `recomputeTotalsFromLogs`), and the admin
 * run-detail drawer, so all three agree on the SAME buckets + labels. No Stripe /
 * Mongoose imports — safe to import from the client.
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
  | "noHeldDraft"
  | "awaitingRetry"
  | "recentlyAttempted"
  | "noLongerPastDue"
  | "alreadyPaid"
  | "missingPaymentMethod"
  | "other";

/** Human labels for each bucket (admin UI). */
export const SKIP_BUCKET_LABELS: Record<SkipBucketKey, string> = {
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
