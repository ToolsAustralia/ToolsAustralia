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
      attemptSpacing: 0,
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


/* ─── Run alerting ───────────────────────────────────────────────────────────
 *
 * A charge run is unattended: nobody watches the cron, and until now a run could
 * abort at 48% of its worklist for five consecutive days without anything saying
 * so. These are the two signals that would have caught it.
 *
 * `console.error`, not `console.log` — next.config.ts strips log/info/debug/warn
 * from production builds, and this only matters in production.
 */

/**
 * Success-rate floor below which a finished run is reported as anomalous.
 *
 * WHY 8%. The five runs immediately before this shipped scored 2.59%, 5.97%,
 * 4.68%, 3.57% and 5.59% (11/425, 25/419, 20/427, 15/420, 21/376) — so any floor
 * above 5.97% fires on all five, and 8% leaves ~34% headroom over the best of them
 * rather than sitting on the boundary. It also catches the catastrophic shape this
 * job has already produced once: the 2026-06-29 idempotency-replay incident logged
 * 656/668 "failures" and collected $0 (0.0%).
 *
 * It is deliberately a FLOOR, not a target. 82% of this account's blocked charges
 * are self-inflicted Adaptive Acceptance blocks (docs/billing-stripe/gotchas.md),
 * and 17% of blocked cards eventually pay, so a run that is spacing its attempts
 * correctly should sit well clear of 8%. If it does not, the alert firing daily IS
 * the finding — not noise to tune away.
 */
export const LOW_SUCCESS_RATE_FLOOR = 0.08;

/**
 * Minimum attempts before the rate is judged at all.
 *
 * A run with a handful of attempts has no meaningful rate: 0/6 is 0% and means
 * nothing. Steady-state automated volume is ~386 real attempts/day, so this floor
 * only ever suppresses a genuinely tiny run — and a run that collapses to near-zero
 * attempts is an abort/coverage problem, which the aborted alert reports instead.
 */
export const LOW_SUCCESS_RATE_MIN_ATTEMPTS = 50;

export interface ChargeRunAlert {
  kind: "aborted" | "zero_coverage" | "low_success_rate";
  message: string;
}

/**
 * Decide which alert lines a run deserves as it reaches a terminal status.
 *
 * Pure — returns the strings; the caller emits them. Keeps the thresholds testable
 * without a DB, and keeps the emit site (which sits inside the money path) trivial.
 *
 * Only terminal runs are judged: a `running` run has partial totals by definition
 * and would otherwise trip the rate alert on its first chunk.
 */
export function buildChargeRunAlerts(run: {
  runId: string;
  status: "running" | "completed" | "failed" | "aborted";
  trigger?: string | null;
  error?: string | null;
  totals: Partial<ChargeJobRunTotals> | null | undefined;
}): ChargeRunAlert[] {
  const alerts: ChargeRunAlert[] = [];
  if (run.status === "running") return alerts;

  const t = normalizeRunTotals(run.totals);
  const summary =
    `eligible=${t.eligibleCount} attempted=${t.attempted} succeeded=${t.succeeded} ` +
    `failed=${t.failed} skipped=${t.skipped.total} revenue=$${(t.revenueCents / 100).toFixed(2)}`;

  if (run.status === "aborted" || run.status === "failed") {
    alerts.push({
      kind: "aborted",
      message:
        `[chargePastDue][ALERT] run ${run.runId} finalized ${run.status.toUpperCase()} ` +
        `(trigger=${run.trigger ?? "admin"}): ${run.error ?? "no reason recorded"} — ${summary}`,
    });
  }

  // ZERO COVERAGE — a run that finished cleanly having charged nobody.
  //
  // This is the collapse mode the attempt cap INTRODUCED, and neither other alert can
  // see it: the run `completed` (so `aborted` never fires) with `attempted === 0` (so
  // the rate alert is suppressed by its own minimum-attempts floor). A systematic
  // spacing-lookup failure — a bad query, a degraded replica, a predicate bug — holds
  // every item back and produces exactly this shape. So does any future filter that
  // over-matches. Collecting nothing while reporting success is the precise failure
  // class this whole plan exists to eliminate, so it gets its own unconditional check.
  //
  // `eligibleCount > 0` is what keeps it quiet on a genuinely empty worklist (nothing
  // past due is not a fault). It CAN fire on a legitimate trough day of the cap's
  // first rotation cycle — that is accepted: a day where not even a newly-past-due
  // member was reachable is worth one log line, and new arrivals (~58/day) mean a true
  // zero is not a steady state.
  if (t.eligibleCount > 0 && t.attempted === 0) {
    alerts.push({
      kind: "zero_coverage",
      message:
        `[chargePastDue][ALERT] run ${run.runId} finished ${run.status.toUpperCase()} having attempted ` +
        `ZERO of ${t.eligibleCount} eligible invoices — nothing was submitted to Stripe. ${summary}`,
    });
  }

  if (t.attempted >= LOW_SUCCESS_RATE_MIN_ATTEMPTS) {
    const rate = t.succeeded / t.attempted;
    if (rate < LOW_SUCCESS_RATE_FLOOR) {
      alerts.push({
        kind: "low_success_rate",
        message:
          `[chargePastDue][ALERT] run ${run.runId} LOW SUCCESS RATE ${(rate * 100).toFixed(1)}% ` +
          `(${t.succeeded}/${t.attempted}) below the ${(LOW_SUCCESS_RATE_FLOOR * 100).toFixed(0)}% floor — ${summary}`,
      });
    }
  }

  return alerts;
}
