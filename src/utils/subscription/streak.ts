/**
 * Membership Streak — pure decision logic (no DB, no Stripe).
 *
 * Spec: docs/superpowers/specs/2026-07-07-membership-streak-design.md
 * Streak = consecutive paid renewals. Join = month 0. Only paid
 * `subscription_cycle` invoices increment; only an out-of-grace `create_new`
 * resubscribe resets. Upgrades/downgrades/pauses never touch the counter.
 *
 * All streak WRITERS (webhook + backfill) route their decisions through this
 * module so the rules are unit-testable without Mongo (test: npm run test:streak).
 */

export const RESUBSCRIBE_GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A paid cycle invoice increments the streak only when the renewal-cycle
 * ledger row transitions INTO paid: pre-image absent (fresh insert) or a
 * not-yet-paid status. A replayed webhook sees "succeeded"/"recovered" → no-op.
 */
export function isFirstTimePaidCycle(previousStatus: string | null | undefined): boolean {
  return previousStatus == null || previousStatus === "expected" || previousStatus === "failed";
}

export type StreakCreateDecision =
  | { action: "none" }
  | { action: "continue" }
  | { action: "start"; streakMonths: 0; streakGeneration: number };

/**
 * Decide the streak effect of a paid `subscription_create` invoice.
 *
 * - Not a create / Mode-B upgrade (new sub with upgrade metadata) → no write.
 * - Resubscribe within RESUBSCRIBE_GRACE_DAYS of the previous endDate → the
 *   streak continues untouched (the next cycle invoice increments it).
 * - Fresh join, or resubscribe past grace (including a missing endDate —
 *   conservative) → start a new streak at month 0; bump the generation only
 *   when a prior streak existed (generation scopes milestone re-earning).
 */
export function decideStreakOnSubscriptionCreate(params: {
  billingReason: string | null | undefined;
  isUpgrade: boolean;
  isResubscribe: boolean;
  previousEndDate: Date | null | undefined;
  currentStreakMonths: number;
  currentStreakGeneration: number;
  now: Date;
}): StreakCreateDecision {
  const {
    billingReason,
    isUpgrade,
    isResubscribe,
    previousEndDate,
    currentStreakMonths,
    currentStreakGeneration,
    now,
  } = params;

  if (billingReason !== "subscription_create") return { action: "none" };
  // Mode-B upgrades arrive as subscription_create on a new sub — streak continuity, no write.
  if (isUpgrade) return { action: "none" };

  if (isResubscribe && previousEndDate instanceof Date) {
    const gapDays = (now.getTime() - previousEndDate.getTime()) / DAY_MS;
    if (gapDays <= RESUBSCRIBE_GRACE_DAYS) return { action: "continue" };
  }

  // Fresh join, or resubscribe past grace (incl. missing endDate — conservative reset).
  return {
    action: "start",
    streakMonths: 0,
    streakGeneration: currentStreakMonths > 0 ? currentStreakGeneration + 1 : currentStreakGeneration,
  };
}

/**
 * A gap between paid cycles long enough that an in-grace return is impossible:
 * 30-day grace + one billing cycle (~31d, the new sub's first renewal is what
 * lands in the ledger) + slack. Shorter gaps (retention pause ≈ 60d, recovery
 * lag) must NOT break.
 */
export const BREAK_GAP_DAYS = 65;
/**
 * Cancel evidence may precede the last paid cycle's dueAt: a scheduled cancel
 * ("scheduled_cancel" history row) is stamped when the member CLICKS cancel,
 * up to a full billing period before the subscription actually lapses.
 */
export const CANCEL_LOOKBACK_DAYS = 40;

export interface StreakBackfillInput {
  /** subscription.startDate (or earliest evidence) — month 0 anchor. */
  joinDate: Date | null;
  /** Earliest date the status-history ledger is trusted from (~2026-04-29). */
  coverageStart: Date;
  /** Paid cycles (status succeeded/recovered), sorted ascending by dueAt. */
  cycles: Array<{ dueAt: Date }>;
  /** MembershipStatusHistory rows with membershipStatus "canceled" OR "scheduled_cancel" (effectiveAt), ascending. */
  cancelDates: Date[];
  isCurrentlyActive: boolean;
  now: Date;
}

export interface StreakBackfillResult {
  streakMonths: number;
  streakGeneration: number;
  breaks: number;
  confidence: "ledger-complete" | "history-incomplete";
}

export function wholeMonthsBetween(a: Date, b: Date): number {
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return Math.max(months, 0);
}

/**
 * Reconstruct streakMonths/streakGeneration from the renewal ledger (backfill +
 * drift repair). Break rule: a gap > BREAK_GAP_DAYS between paid cycles (long
 * enough that an in-grace return is impossible) WITH cancel evidence — a
 * "canceled" OR "scheduled_cancel" history row landing anywhere from
 * CANCEL_LOOKBACK_DAYS before the previous paid cycle (a scheduled-cancel click
 * precedes the lapse) up to the next paid cycle = a generation break; the next
 * cycle is renewal #1 of the new generation. Long gaps WITHOUT cancel evidence
 * (recovery lag, retention pause ≈ 60d) continue without crediting the missed
 * months. Round-up rule: history-incomplete (join predates coverage) +
 * currently active + zero detected breaks → round UP to whole months since
 * join (never under-credit veterans; owner-approved).
 *
 * NOTE for repair runs: the ledger cannot see every live reset (the live
 * writer's grace test uses subscription.endDate). The runner therefore never
 * writes when the user's LIVE streakGeneration is greater than the computed
 * one — a live-written reset always wins over a recomputation.
 */
export function computeStreakFromHistory(input: StreakBackfillInput): StreakBackfillResult {
  const { joinDate, coverageStart, cycles, cancelDates, isCurrentlyActive, now } = input;
  const DAY = 24 * 60 * 60 * 1000;
  let count = 0;
  let generation = 1;
  let breaks = 0;
  let prevAt: Date | null = joinDate;

  for (const cycle of cycles) {
    const gapDays = prevAt ? (cycle.dueAt.getTime() - prevAt.getTime()) / DAY : 0;
    const anchor = prevAt;
    const hasCancelEvidence =
      anchor !== null &&
      cancelDates.some(
        (c) => c.getTime() > anchor.getTime() - CANCEL_LOOKBACK_DAYS * DAY && c < cycle.dueAt
      );

    if (prevAt && gapDays > BREAK_GAP_DAYS && hasCancelEvidence) {
      generation += 1;
      breaks += 1;
      count = 1; // this paid cycle is renewal #1 of the new generation
    } else {
      count += 1;
    }
    prevAt = cycle.dueAt;
  }

  const historyIncomplete = joinDate !== null && joinDate < coverageStart;
  let streakMonths = count;
  if (historyIncomplete && isCurrentlyActive && breaks === 0 && joinDate) {
    streakMonths = Math.max(count, wholeMonthsBetween(joinDate, now));
  }

  return {
    streakMonths,
    streakGeneration: generation,
    breaks,
    confidence: historyIncomplete ? "history-incomplete" : "ledger-complete",
  };
}
