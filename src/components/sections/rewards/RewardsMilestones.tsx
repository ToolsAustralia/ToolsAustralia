"use client";

import { Medal, Check, Lock } from "lucide-react";
import { cn } from "@/utils/cn";
import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";

interface RewardsMilestonesProps {
  acct: DashboardAccountState;
  /** Months of continuous membership (real member-since data). */
  months: number | null;
}

// Documented loyalty milestones (source: rewards domain). No fabricated amounts.
const MILESTONES = [
  { mo: 3, entries: 50 },
  { mo: 6, entries: 250 },
];
const MAX_MO = MILESTONES[MILESTONES.length - 1].mo;

/**
 * Loyalty milestones — a visual progress track showing where the member currently
 * sits and how many months remain until the next reward. Driven by real
 * continuous-membership `months` (same signal LoyaltyStreak uses); milestone
 * amounts are documented constants, never fabricated. Member perk only.
 */
export default function RewardsMilestones({ acct, months }: RewardsMilestonesProps) {
  if (acct !== "active" && acct !== "pastdue") return null;

  const m = Math.max(months ?? 0, 0);
  const progressPct = Math.min(m / MAX_MO, 1) * 100;
  const nextMilestone = MILESTONES.find((ms) => ms.mo > m) ?? null;
  const monthsToNext = nextMilestone ? Math.max(nextMilestone.mo - m, 0) : 0;

  return (
    <section className="rounded-3xl border border-token bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
            <Medal className="h-4 w-4" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">Loyalty milestones</span>
        </div>
        <span className="rounded-full border border-amber-400/40 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
          {m} month{m === 1 ? "" : "s"}
        </span>
      </div>

      {/* Visual track: current position + milestone nodes. */}
      <div className="px-4 pb-9 pt-6">
        <div className="relative h-2 rounded-full bg-black/[.07] dark:bg-white/[.10]">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${progressPct}%`, background: "linear-gradient(90deg,#fbbf24,#d97706)" }}
          />
          {MILESTONES.map((ms) => {
            const reached = m >= ms.mo;
            const pos = (ms.mo / MAX_MO) * 100;
            return (
              <div key={ms.mo} className="absolute top-1/2" style={{ left: `${pos}%`, transform: "translate(-50%,-50%)" }}>
                <span
                  className={cn("grid h-6 w-6 place-items-center rounded-full border-2 border-surface text-white shadow-sm")}
                  style={{ background: reached ? "linear-gradient(180deg,#fbbf24,#d97706)" : "#c7ccd3" }}
                >
                  {reached ? <Check className="h-3.5 w-3.5" /> : <Lock className="h-3 w-3" />}
                </span>
                <div className="absolute left-1/2 top-[27px] -translate-x-1/2 whitespace-nowrap text-center">
                  <div className={cn("text-[11px] font-black", reached ? "text-amber-600 dark:text-amber-400" : "text-primary-token dark:text-white")}>
                    +{ms.entries}
                  </div>
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-token">{ms.mo} mo</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[12px] font-medium leading-[1.5] text-muted-token">
        {acct === "pastdue" ? (
          <>
            <b className="text-[#d97706]">Reactivate to keep your streak</b> — milestone progress pauses while payment is overdue.
          </>
        ) : nextMilestone ? (
          <>
            <b className="text-primary-token dark:text-white">{monthsToNext} month{monthsToNext === 1 ? "" : "s"}</b> to your next{" "}
            <b className="text-amber-600 dark:text-amber-400">+{nextMilestone.entries} free entries</b>. Rewards land in your wallet automatically.
          </>
        ) : (
          <>
            <b className="text-emerald-600 dark:text-emerald-400">All milestones unlocked</b> — thanks for {m} months of membership. Rewards land in your wallet automatically.
          </>
        )}
      </p>
    </section>
  );
}
