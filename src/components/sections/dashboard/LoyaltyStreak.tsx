"use client";

import { Flame } from "lucide-react";
import { cn } from "@/utils/cn";
import { isDashboardFeatureOn } from "@/config/dashboardFeatures";
import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";

interface LoyaltyStreakProps {
  months: number | null;
  acct: DashboardAccountState;
  className?: string;
}

const STREAK_GOAL = 6;

/**
 * Loyalty streak card — months of continuous membership on a 6-segment track.
 * The milestone-unlock line ("+250 free entries at 6 months — n to go") is gated
 * behind the `milestoneProgress` coming-soon switch: until a customer-facing
 * milestone-progress read exists, we never fabricate a progress figure.
 * Member/past-due only (streak is a membership perk).
 */
export default function LoyaltyStreak({ months, acct, className }: LoyaltyStreakProps) {
  if (acct !== "active" && acct !== "pastdue") return null;

  const atRisk = acct === "pastdue";
  const filled = Math.min(Math.max(months ?? 0, 0), STREAK_GOAL);
  const toGo = Math.max(STREAK_GOAL - filled, 0);
  const showMilestone = isDashboardFeatureOn("milestoneProgress");

  return (
    <section className={cn("rounded-3xl border border-token bg-surface p-5 shadow-sm", className)}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">Loyalty streak</span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold",
            atRisk
              ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
              : "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400",
          )}
        >
          <Flame className="h-3.5 w-3.5" />
          {atRisk ? "At risk" : `${months ?? 0} months`}
        </span>
      </div>

      <div className="mt-4 flex gap-1.5" aria-hidden>
        {Array.from({ length: STREAK_GOAL }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-2 flex-1 rounded-full",
              i < filled
                ? atRisk
                  ? "bg-amber-500"
                  : "bg-red-500"
                : "bg-black/[.08] dark:bg-white/[.10]",
            )}
          />
        ))}
      </div>

      <p className="mt-3 text-sm text-muted-token">
        {atRisk ? (
          "Reactivate to keep your streak going."
        ) : showMilestone ? (
          <>
            +250 <strong className="text-primary-token dark:text-white">free entries</strong> unlock at {STREAK_GOAL} months
            {toGo > 0 ? ` — ${toGo} to go.` : " — unlocked!"} Keep your membership active.
          </>
        ) : (
          "Keep your membership active to grow your streak."
        )}
      </p>
    </section>
  );
}
