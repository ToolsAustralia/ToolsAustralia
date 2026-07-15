"use client";

import { useEffect, useState } from "react";
import { STREAK_MILESTONES, STREAK_RECURRENCE_PERIOD } from "@/config/streakMilestones";

export interface StreakJustHit {
  entries: number;
  /** Absolute streak level the reward fired at (14 = year-2 Lv.2). */
  level: number;
}

const KEY_PREFIX = "ta-streak-seen:";

/** Milestone amount that fires exactly AT a given absolute streak level, or null. */
function rewardAtLevel(level: number): number | null {
  if (level < STREAK_MILESTONES[0].level) return null;
  const withinYear = ((level - 1) % STREAK_RECURRENCE_PERIOD) + 1;
  return STREAK_MILESTONES.find((r) => r.level === withinYear)?.entries ?? null;
}

/**
 * Membership Streak celebration — fires ONCE per milestone, on the first
 * dashboard visit after the streak counter crossed a rung (the sign-in moment,
 * spec §7b M1/M2: one toast + the in-card banner, never a modal).
 *
 * Detection is client-side: the last-celebrated streak level is persisted
 * per-user in localStorage; when the live counter exceeds it AND the new level
 * sits on a rung, the celebration shows once and the marker advances. First-ever
 * visit seeds the marker silently (no retro celebrations — matches the backfill
 * "recognise, don't pay" policy). Cleared with the rest of the per-user keys on
 * sign-out (total-sign-out clears ta-* user-scoped storage).
 */
export function useStreakCelebration(
  userId: string | null | undefined,
  streakMonths: number | null,
  enabled: boolean
): { justHit: StreakJustHit | null } {
  const [justHit, setJustHit] = useState<StreakJustHit | null>(null);

  useEffect(() => {
    if (!enabled || !userId || streakMonths == null) return;
    const key = `${KEY_PREFIX}${userId}`;
    let lastSeen: number | null = null;
    try {
      const raw = localStorage.getItem(key);
      lastSeen = raw == null ? null : Number(raw);
      if (lastSeen != null && Number.isNaN(lastSeen)) lastSeen = null;
    } catch {
      return; // storage unavailable — celebration is a nicety, never an error
    }

    if (lastSeen == null) {
      // Seed silently — no retro celebration for pre-existing tenure.
      try {
        localStorage.setItem(key, String(streakMonths));
      } catch {}
      return;
    }

    if (streakMonths > lastSeen) {
      // Celebrate the highest rung crossed since last seen (a multi-month gap
      // between visits celebrates once, with the newest reward).
      let hit: StreakJustHit | null = null;
      for (let lvl = lastSeen + 1; lvl <= streakMonths; lvl++) {
        const entries = rewardAtLevel(lvl);
        if (entries != null) hit = { entries, level: lvl };
      }
      try {
        localStorage.setItem(key, String(streakMonths));
      } catch {}
      if (hit) setJustHit(hit);
    } else if (streakMonths < lastSeen) {
      // Streak reset (full lapse → resubscribe). Re-seed the marker DOWN so the
      // new generation's rungs celebrate as they're re-earned — otherwise a
      // member who peaked at 8 would celebrate nothing until they pass 8 again.
      try {
        localStorage.setItem(key, String(streakMonths));
      } catch {}
    }
  }, [enabled, userId, streakMonths]);

  return { justHit };
}
