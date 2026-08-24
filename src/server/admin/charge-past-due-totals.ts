/**
 * Pure helpers for ChargeJobRun aggregation + orphan detection.
 *
 * Stripe-free + Mongoose-free so they can be unit-tested without env vars or DB.
 */

import type { ChargeJobRunTotals } from "@/models/ChargeJobRun";
import { skipReasonToBucket } from "@/utils/admin/chargeSkipReasons";

/**
 * Orphan-run cleanup window — 30min lock auto-expiry + 5min skew buffer.
 *
 * Measured against LAST PROGRESS, never against elapsed time since start. See
 * `isOrphanRun` for why, and why raising this number is the wrong fix.
 */
export const ORPHAN_RUN_THRESHOLD_MS = 35 * 60 * 1000;

/** Minimal row shape needed for totals aggregation — matches InvoiceChargeLog. */
export interface ChargeLogRowForAggregation {
  status: "success" | "failed" | "skipped";
  amount: number;
  skipReason?: string;
}

function bumpSkipBucket(
  totals: ChargeJobRunTotals,
  reason: string | undefined
): void {
  totals.skipped.total += 1;
  // Bucket key === breakdown field name (kept in lockstep by chargeSkipReasons.ts).
  totals.skipped[skipReasonToBucket(reason)] += 1;
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
      noHeldDraft: 0,
      awaitingRetry: 0,
      excessiveRetryCooldown: 0,
      other: 0,
    },
    revenueCents: 0,
  };
}

/**
 * Back-fill any totals fields a PERSISTED `ChargeJobRun.totals` predates.
 *
 * Skip buckets have been added over time (`noHeldDraft` + `awaitingRetry` on 2026-07-20),
 * and runs finalized before then have no such keys. Readers must not assume the stored
 * document has today's shape: the Norm mirror validates its response against a Zod schema
 * where those fields are REQUIRED, so a single legacy run on the page made
 * `/v1/charge-past-due/runs` return a **500 `response_schema_invalid`** — invisible to
 * `tsc`, and caught only by `npm run norm:smoke`. (The admin drawer never hit this because
 * it recomputes its skip breakdown client-side from the run's rows.)
 *
 * Normalize at the read boundary rather than migrating the collection: old runs are
 * immutable history, and a missing bucket genuinely means zero.
 */
export function normalizeRunTotals(
  totals: Partial<ChargeJobRunTotals> | null | undefined
): ChargeJobRunTotals {
  const base = emptyTotals(totals?.eligibleCount ?? 0);
  if (!totals) return base;
  return {
    ...base,
    ...totals,
    skipped: { ...base.skipped, ...(totals.skipped ?? {}) },
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

/**
 * The instant a run last proved it was alive: its progress heartbeat, or — for
 * rows written before `lastProgressAt` existed — the time it started.
 *
 * Exported so every caller applies ONE rule: `sweepOrphanRuns` (via `isOrphanRun`),
 * the abort message it writes, and the `fix-stuck-charge-jobs` ops script. The rule
 * is deliberately not restated as a Mongo predicate — a second copy is how the
 * sweep and `isOrphanRun` drifted apart in the first place, and Mongo cannot
 * evaluate `??` without an index-defeating `$expr`.
 */
export function runLivenessAt(run: {
  startedAt: Date;
  lastProgressAt?: Date | null;
}): Date {
  return run.lastProgressAt ?? run.startedAt;
}

/**
 * True when a `running` ChargeJobRun has gone quiet for longer than the cleanup
 * window — i.e. it is genuinely wedged, not merely long.
 *
 * KEYED ON LAST PROGRESS, NOT ON ELAPSED TIME (2026-08-24). This used to be
 * `now - startedAt`, and the sweep query duplicated that as
 * `startedAt: { $lt: cutoff }`. Real production runs take 36.5-39.0 minutes
 * against a 35-minute window, so every single run was aborted mid-flight by the
 * next 5-minute cron tick at ~48% of its worklist — five consecutive days,
 * ~$2,800 of attempted recovery left uncollected, 229 of 1,157 past-due members
 * never attempted at all in 30 days, and 94% of each day's attempts repeated on
 * the same cards (which is what manufactures Stripe's excessive-retry blocks).
 *
 * Raising the threshold would only move the cliff: the eligible population went
 * 813 -> 1103 in those same five days. The lock is already renewed per chunk, so
 * a true liveness signal exists — a run writing InvoiceChargeLog rows is alive by
 * definition, at any worklist size, with nothing to retune as the base grows.
 *
 * Legacy rows have no heartbeat and fall back to `startedAt`, so nothing written
 * before this change can stick `running` forever.
 */
export function isOrphanRun(
  run: {
    status: "running" | "completed" | "failed" | "aborted";
    startedAt: Date;
    /** Absent on runs created before 2026-08-24 → falls back to `startedAt`. */
    lastProgressAt?: Date | null;
  },
  now: Date = new Date()
): boolean {
  if (run.status !== "running") return false;
  return now.getTime() - runLivenessAt(run).getTime() >= ORPHAN_RUN_THRESHOLD_MS;
}
