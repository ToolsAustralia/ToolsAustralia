/**
 * Membership Streak — the reward ladder, as displayed.
 *
 * SINGLE SOURCE for every UI surface (LoyaltyStreak card rungs, RewardsMilestones
 * track, guest teaser, wallet copy, cancellation stakes). MUST mirror the seeded
 * `MilestoneReward` rows (scripts/seed-streak-milestone-rewards.ts) — the engine
 * is the source of truth; this is its client-side reflection.
 *
 * Ladder rule (owner-locked 2026-07-07): rungs at renewals 2/4/6/8/10/12 pay
 * +100…+600 free entries, and the FULL ladder repeats every streak year
 * (recurrencePeriod 12): month 14 ≡ month 2 (+100 again), month 24 ≡ month 12.
 * The Founding badge fires once, at the first Lv.12.
 *
 * Spec: docs/superpowers/specs/2026-07-07-membership-streak-design.md §2.
 */

export interface StreakMilestone {
  /** Renewal count the rung fires at (within a streak year). */
  level: number;
  /** Free entries auto-granted into the Major Draw. */
  entries: number;
}

export const STREAK_MILESTONES: StreakMilestone[] = [
  { level: 2, entries: 100 },
  { level: 4, entries: 200 },
  { level: 6, entries: 300 },
  { level: 8, entries: 400 },
  { level: 10, entries: 500 },
  { level: 12, entries: 600 },
];

/** The ladder repeats every this-many renewals (mirrors MilestoneReward.recurrencePeriod). */
export const STREAK_RECURRENCE_PERIOD = 12;

/** Streak level at which the permanent Founding-member badge is earned. */
export const STREAK_FOUNDING_LEVEL = 12;

export interface NextStreakMilestone {
  /** Absolute renewal count it fires at (may exceed 12 — annual repeats: 14, 16, …). */
  level: number;
  /** The rung's base level within the year (2–12) — what the rail plate reads. */
  rungLevel: number;
  entries: number;
  /** Renewals still needed. */
  toGo: number;
}

/**
 * The next reward ahead of a given streak, honouring the annual repeat
 * (streak 13 → Lv.14 +100; streak 23 → Lv.24 +600; streak 24 → Lv.26 +100).
 */
export function nextStreakMilestone(streakMonths: number): NextStreakMilestone {
  const streak = Math.max(0, streakMonths);
  const yearOffset = Math.floor(Math.max(0, streak - 1) / STREAK_RECURRENCE_PERIOD) * STREAK_RECURRENCE_PERIOD;
  for (const base of [yearOffset, yearOffset + STREAK_RECURRENCE_PERIOD]) {
    for (const rung of STREAK_MILESTONES) {
      const level = rung.level + base;
      if (level > streak) {
        return { level, rungLevel: rung.level, entries: rung.entries, toGo: level - streak };
      }
    }
  }
  // Unreachable (the second pass always yields), but keep TS + runtime safe.
  const first = STREAK_MILESTONES[0];
  return { level: streak + first.level, rungLevel: first.level, entries: first.entries, toGo: first.level };
}

/** Whether a rung (by its 2–12 base level) is already earned at this streak, within the current year-cycle. */
export function isRungEarned(rungLevel: number, streakMonths: number): boolean {
  if (streakMonths <= 0) return false;
  const withinYear = ((streakMonths - 1) % STREAK_RECURRENCE_PERIOD) + 1;
  return withinYear >= rungLevel;
}
