/**
 * Pure, dependency-free DECLINE vocabulary for the bulk past-due charge flows —
 * the counterpart to `chargeSkipReasons.ts`, and shared for the same reason: the
 * server-side decline summary (`summariseDeclineCodes`) and the admin run drawer
 * must bucket identically. They previously each implemented the precedence rule
 * and drifted, producing the "unknown 206" chip on the 30 Jul 2026 run while the
 * summary card showed nothing at all.
 *
 * No Stripe / Mongoose imports — safe to import from the client.
 *
 * ── Why some rows must be skipped ────────────────────────────────────────────
 * The bulk job writes ONE run-tagged summary row per recovered worklist item,
 * against the ORIGINAL invoice id, carrying `result.recovery.bulk` and no code.
 * Whether that row is the member's ONLY record depends on which recovery branch ran:
 *
 *  - HELD-DRAFT recovery → the pay attempt happened on a NEW invoice and wrote its
 *    own coded row. The summary row records `result.recovery.newInvoiceId`. Counting
 *    both double-counts one member, so the summary row is excluded.
 *  - MINT / re-bill recovery (`no_held_draft` → `unpauseAndAnchorNow`) → there is no
 *    separate pay row anywhere; `summarizeBulkRecoveryOutcome`'s mid-flight branch
 *    returns no `newInvoiceId`. The summary row is the ONLY evidence the member's
 *    freshly minted invoice declined. Excluding it hid 237 real declines over
 *    28–31 Jul 2026 — so it MUST be counted.
 *
 * Presence of `newInvoiceId` is therefore the exact "does a coded twin exist?"
 * discriminator. Do not replace it with `errorMessage` prefix parsing.
 */

/** The subset of an InvoiceChargeLog row this module needs. */
export interface DeclineClassifiableRow {
  status?: string | null;
  declineCode?: string | null;
  errorCode?: string | null;
  recovery?: {
    /** Set on the bulk run's single run-tagged recovery summary row. */
    bulk?: boolean | null;
    /** Set on recovery machinery audit rows (create / finalize / void). */
    step?: string | null;
    /** Present only when a separate, CODED pay row exists on that new invoice. */
    newInvoiceId?: string | null;
  } | null;
}

/**
 * Synthetic codes persisted at write time so recovery outcomes that have no Stripe
 * decline code still bucket as themselves instead of falling into `unknown`.
 * Written by `summarizeBulkRecoveryOutcome` / the bulk job's recovery logger.
 */
export const RECOVERY_DECLINE_CODES = {
  /**
   * The recovery minted a fresh current-cycle invoice via `unpauseAndAnchorNow` and
   * Stripe's automatic charge did not settle it (`status != paid`). A REAL card
   * decline — Stripe just never hands us a decline code on this path, because the
   * mint result carries only the invoice status.
   */
  rebillNotSettled: "rebill_not_settled",
  /** An unexpected (non-Stripe) throw inside the recovery flow — machinery fault. */
  recoveryError: "recovery_error",
} as const;

/** Admin-facing labels for the synthetic codes. Stripe codes are labelled elsewhere. */
export const RECOVERY_DECLINE_LABELS: Record<string, string> = {
  [RECOVERY_DECLINE_CODES.rebillNotSettled]: "Re-billed cycle didn't settle",
  [RECOVERY_DECLINE_CODES.recoveryError]: "Recovery error",
};

/**
 * Should this row be counted in the decline breakdown?
 *
 * Excludes non-outcome machinery rows and the recovery summary rows whose coded twin
 * is already being counted. Callers are expected to have filtered to failed rows, but
 * the status check is included so both call sites cannot disagree about it either.
 */
export function countsAsDecline(row: DeclineClassifiableRow): boolean {
  if (row.status !== "failed") return false;
  // Machinery audit rows (void / finalize / create) are not card outcomes at all.
  if (row.recovery?.step) return false;
  // Bulk recovery summary row: count it ONLY when no coded twin exists.
  if (row.recovery?.bulk && row.recovery?.newInvoiceId) return false;
  return true;
}

/**
 * Canonical decline code for a row: the specific issuer reason wins over the bucket,
 * and an uncoded row falls back to `unknown`.
 */
export function declineCodeOf(row: DeclineClassifiableRow): string {
  return row.declineCode ?? row.errorCode ?? "unknown";
}

/**
 * Count declines per code across a set of rows, highest first. Used by the admin run
 * drawer; the server-side date-ranged summary applies the same predicates in Mongo
 * (see `MONGO_DECLINE_MATCH`).
 */
export function summariseDeclineRows(rows: DeclineClassifiableRow[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!countsAsDecline(row)) continue;
    const code = declineCodeOf(row);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * The Mongo `$match` equivalent of `countsAsDecline`, so the aggregation and the
 * client-side breakdown cannot drift. Spread into a `$match` alongside any date range.
 */
export const MONGO_DECLINE_MATCH: Record<string, unknown> = {
  status: "failed",
  "result.recovery.step": { $exists: false },
  // Count a bulk recovery summary row unless its coded twin exists (see module header).
  $or: [
    { "result.recovery.bulk": { $exists: false } },
    { "result.recovery.newInvoiceId": { $exists: false } },
  ],
};
