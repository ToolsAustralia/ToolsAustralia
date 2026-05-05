/**
 * Pure helpers for ChargeJobRun aggregation + orphan detection.
 *
 * Stripe-free + Mongoose-free so they can be unit-tested without env vars or DB.
 */

import type { ChargeJobRunTotals } from "@/models/ChargeJobRun";

/** Orphan-run cleanup window — 30min lock auto-expiry + 5min skew buffer. */
export const ORPHAN_RUN_THRESHOLD_MS = 35 * 60 * 1000;

/** Minimal row shape needed for totals aggregation — matches InvoiceChargeLog. */
export interface ChargeLogRowForAggregation {
  status: "success" | "failed" | "skipped";
  amount: number;
  skipReason?: string;
}

const KNOWN_SKIP_REASONS = new Set([
  "recently_attempted",
  "no_longer_past_due",
  "already_paid",
  "missing_payment_method",
]);

function bumpSkipBucket(
  totals: ChargeJobRunTotals,
  reason: string | undefined
): void {
  totals.skipped.total += 1;
  switch (reason) {
    case "recently_attempted":
      totals.skipped.recentlyAttempted += 1;
      break;
    case "no_longer_past_due":
      totals.skipped.noLongerPastDue += 1;
      break;
    case "already_paid":
      totals.skipped.alreadyPaid += 1;
      break;
    case "missing_payment_method":
      totals.skipped.missingPaymentMethod += 1;
      break;
    default:
      if (!reason || !KNOWN_SKIP_REASONS.has(reason)) {
        totals.skipped.other += 1;
      }
      break;
  }
}

/** Build a fresh empty totals object — no shared references. */
export function emptyTotals(eligibleCount: number = 0): ChargeJobRunTotals {
  return {
    eligibleCount,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skipped: {
      total: 0,
      recentlyAttempted: 0,
      noLongerPastDue: 0,
      alreadyPaid: 0,
      missingPaymentMethod: 0,
      other: 0,
    },
    revenueCents: 0,
  };
}

/**
 * Aggregate per-invoice attempt rows into ChargeJobRun totals.
 *
 * Rules:
 * - `attempted` counts success + failed only (skipped never reached Stripe).
 * - `revenueCents` sums `amount` only when `status === "success"`.
 * - Skip reasons are bucketed; unknown / missing reasons land in `other`.
 */
export function aggregateRunTotals(
  rows: readonly ChargeLogRowForAggregation[],
  eligibleCount: number = 0
): ChargeJobRunTotals {
  const totals = emptyTotals(eligibleCount);
  for (const r of rows) {
    if (r.status === "success") {
      totals.attempted += 1;
      totals.succeeded += 1;
      totals.revenueCents += r.amount;
    } else if (r.status === "failed") {
      totals.attempted += 1;
      totals.failed += 1;
    } else {
      bumpSkipBucket(totals, r.skipReason);
    }
  }
  return totals;
}

/** True when a `running` ChargeJobRun has aged past the cleanup threshold. */
export function isOrphanRun(
  run: { status: "running" | "completed" | "failed" | "aborted"; startedAt: Date },
  now: Date = new Date()
): boolean {
  if (run.status !== "running") return false;
  return now.getTime() - run.startedAt.getTime() >= ORPHAN_RUN_THRESHOLD_MS;
}
