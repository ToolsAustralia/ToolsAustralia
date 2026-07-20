"use client";

import { Medal, Check, Lock } from "lucide-react";
import { cn } from "@/utils/cn";
import { glossGrad, inkOn } from "@/utils/membership/tier-visuals";
import { isDashboardFeatureOn } from "@/config/dashboardFeatures";
import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";
import {
  STREAK_MILESTONES,
  STREAK_RECURRENCE_PERIOD,
  nextStreakMilestone,
  isRungEarned,
} from "@/config/streakMilestones";

interface RewardsMilestonesProps {
  acct: DashboardAccountState;
  /** Consecutive paid renewals (real subscription.streakMonths). */
  months: number | null;
  /** Owned tier hex — themes the header banner (Tradie / Foreman / Boss). */
  tierHex?: string | null;
}

/** Past-due band per the Build Kit (fixed red — semantic, not tier). */
const PASTDUE_BAND = "linear-gradient(157deg,#ff3b3b,#c40000 56%,#e00000)";

/**
 * Loyalty milestones — package-themed banner over the streak-ladder progress
 * track. Driven by the REAL streak counter and the single MILESTONES config
 * (config/streakMilestones.ts — mirrors the seeded MilestoneReward rungs).
 * The ladder repeats every streak year (month 14 ≡ month 2), so the track shows
 * the position within the current year-cycle. Member perk only.
 */
export default function RewardsMilestones({ acct, months, tierHex }: RewardsMilestonesProps) {
  if (acct !== "active" && acct !== "pastdue") return null;

  const m = Math.max(months ?? 0, 0);
  const withinYear = m > 0 ? ((m - 1) % STREAK_RECURRENCE_PERIOD) + 1 : 0;
  const progressPct = Math.min(withinYear / STREAK_RECURRENCE_PERIOD, 1) * 100;
  const next = nextStreakMilestone(m);
  const isPastDue = acct === "pastdue";

  const hex = tierHex ?? "#78828f";
  const ink = isPastDue ? "#fff" : inkOn(hex);
  const chipBg = ink === "#0a0a0a" ? "rgba(0,0,0,.13)" : "rgba(255,255,255,.16)";
  const band = isPastDue ? PASTDUE_BAND : glossGrad(hex);

  // Coming-soon teaser until the milestoneProgress flag ships the live track.
  if (!isDashboardFeatureOn("milestoneProgress")) {
    return (
      <section className="overflow-hidden rounded-3xl border border-token bg-surface shadow-sm">
        <div className="relative flex items-center gap-3 px-4 py-3.5" style={{ background: glossGrad(hex), color: inkOn(hex) }}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: chipBg }}>
            <Medal className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-poppins text-[15px] font-extrabold leading-tight">Loyalty milestones</div>
            <div className="mt-0.5 text-[11px] font-semibold opacity-80">Earn free entries the longer you stay</div>
          </div>
          <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em]" style={{ background: chipBg }}>Coming soon</span>
        </div>
      </section>
    );
  }

  const banner = isPastDue
    ? { title: "Reactivate to keep your streak", subtitle: "Milestone progress pauses while payment is overdue", right: null }
    : {
        title: `Next: +${next.entries} free entries`,
        subtitle: next.level > STREAK_RECURRENCE_PERIOD ? `Unlocks at Lv.${next.level} — the ladder repeats every year` : `Unlocks at your ${next.level}-month milestone`,
        right: { m, of: next.level },
      };

  return (
    <section className="overflow-hidden rounded-3xl border border-token bg-surface shadow-sm transition-transform duration-300 motion-safe:hover:-translate-y-[3px]">
      {/* Package-themed header banner (fixed red when past-due) */}
      <div className="relative flex items-center gap-3 px-4 py-3.5" style={{ background: band, color: ink }}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: chipBg }}>
          <Medal className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-poppins text-[15px] font-extrabold leading-tight">{banner.title}</div>
          <div className="mt-0.5 text-[11px] font-semibold opacity-80">{banner.subtitle}</div>
        </div>
        {banner.right && (
          <div className="shrink-0 text-right leading-none">
            <span className="num font-poppins text-xl font-black tabular-nums">{banner.right.m}</span>
            <span className="text-[11px] font-bold opacity-80"> /{banner.right.of} mo</span>
          </div>
        )}
      </div>

      {/* Streak-ladder track: fill + one node per rung. Captions hang below the
          bar (absolute) — bottom padding must clear them (card is overflow-hidden). */}
      <div className="px-6 pb-14 pt-8">
        <div className="relative h-2 rounded-full bg-black/[.07] dark:bg-white/[.10]">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${progressPct}%`, background: "linear-gradient(90deg,#fbbf24,#d97706)", ...(isPastDue ? { filter: "saturate(.5)" } : {}) }}
          />
          {STREAK_MILESTONES.map((ms) => {
            const reached = isRungEarned(ms.level, m);
            const pos = (ms.level / STREAK_RECURRENCE_PERIOD) * 100;
            return (
              <div key={ms.level} className="absolute top-1/2" style={{ left: `${pos}%`, transform: "translate(-50%,-50%)" }}>
                <span
                  className="grid h-6 w-6 place-items-center rounded-full border-2 border-[var(--bg-surface)] text-white shadow-sm"
                  style={{
                    background: reached ? "linear-gradient(180deg,#fbbf24,#d97706)" : "#c7ccd3",
                    ...(reached && isPastDue ? { filter: "saturate(.55)" } : {}),
                  }}
                >
                  {reached ? <Check className="h-3.5 w-3.5" /> : <Lock className="h-3 w-3" />}
                </span>
                <div className="absolute left-1/2 top-[27px] -translate-x-1/2 whitespace-nowrap text-center">
                  <div className={cn("text-[11px] font-black tabular-nums", reached ? "text-amber-600 dark:text-amber-400" : "text-primary-token dark:text-white")}>
                    +{ms.entries}
                  </div>
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-token">{ms.level} mo</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
