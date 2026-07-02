"use client";

import { Medal, Check } from "lucide-react";
import { cn } from "@/utils/cn";
import { isDashboardFeatureOn } from "@/config/dashboardFeatures";
import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";

interface RewardsMilestonesProps {
  acct: DashboardAccountState;
  /** Months of continuous membership (used only when milestoneProgress is enabled). */
  months: number | null;
}

// Documented loyalty milestones (source: rewards domain). No fabricated amounts.
const MILESTONES = [
  { mo: 3, entries: 50 },
  { mo: 6, entries: 250 },
];

/**
 * Loyalty milestones. The progress stepper (current position) is gated behind the
 * `milestoneProgress` coming-soon switch — there is no customer-facing
 * milestone-progress read yet, so we never fabricate a "% to next" figure. Until
 * enabled, a static teaser of the documented tiers is shown. Member perk only.
 */
export default function RewardsMilestones({ acct, months }: RewardsMilestonesProps) {
  if (acct !== "active" && acct !== "pastdue") return null;
  const showProgress = isDashboardFeatureOn("milestoneProgress");
  const m = months ?? 0;

  return (
    <section className="rounded-3xl border border-token bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
          <Medal className="h-4 w-4" />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">Loyalty milestones</span>
      </div>

      {showProgress ? (
        <ol className="mt-4 space-y-3">
          {MILESTONES.map((ms) => {
            const done = m >= ms.mo;
            return (
              <li key={ms.mo} className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold",
                    done ? "bg-emerald-500 text-white" : "bg-black/[.06] text-muted-token dark:bg-white/[.10]",
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : `${ms.mo}m`}
                </span>
                <div className="flex-1 text-sm text-primary-token dark:text-white">
                  <strong>+{ms.entries} free entries</strong> at {ms.mo} months
                </div>
                {done && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Unlocked</span>}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-muted-token">
          Earn bonus entries the longer you stay a member — <strong className="text-primary-token dark:text-white">+50 free entries</strong> at 3 months and <strong className="text-primary-token dark:text-white">+250</strong> at 6 months. Rewards land in your wallet automatically.
        </p>
      )}
    </section>
  );
}
