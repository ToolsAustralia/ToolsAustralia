"use client";

import { Flame } from "lucide-react";
import { cn } from "@/utils/cn";
import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";

interface LoyaltyStreakProps {
  months: number | null;
  acct: DashboardAccountState;
  className?: string;
}

const STREAK_GOAL = 6;

/**
 * Loyalty streak card — ported from the prototype. Months of continuous
 * membership on a 6-segment gold track. Member/past-due only (member perk).
 *
 * NOTE: the "+250 free entries at 6 months" figure is the design's stated
 * milestone reward — confirm it against the real MilestoneReward config before
 * launch (docs flag). The months + "N to go" are derived from real data.
 */
export default function LoyaltyStreak({ months, acct, className }: LoyaltyStreakProps) {
  if (acct !== "active" && acct !== "pastdue") return null;

  const atRisk = acct === "pastdue";
  const m = Math.max(months ?? 0, 0);
  const filled = Math.min(m, STREAK_GOAL);
  const toGo = Math.max(STREAK_GOAL - m, 0);

  return (
    <section className={cn("rounded-[1.1rem] border border-token bg-surface p-4 shadow-sm", className)}>
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 font-['Poppins'] text-[13.5px] font-extrabold text-primary-token dark:text-white">
          <Flame className="h-[17px] w-[17px] text-[#d97706]" /> Loyalty streak
        </span>
        <span
          className="rounded-full border px-[9px] py-1 text-[12.5px] font-semibold"
          style={{ color: atRisk ? "#d97706" : "#d97706", borderColor: "rgba(217,119,6,.4)" }}
        >
          {atRisk ? "At risk" : `${m} month${m === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: STREAK_GOAL }).map((_, i) => (
          <span
            key={i}
            className="h-2 flex-1 rounded"
            style={
              i < filled
                ? { background: "linear-gradient(180deg,#fbbf24,#d97706)", border: "1px solid #d97706" }
                : { background: "rgba(0,0,0,.05)", border: "1px solid rgba(0,0,0,.08)" }
            }
          />
        ))}
      </div>

      <p className="mt-3 text-[11.5px] leading-[1.45] text-muted-token">
        {atRisk ? (
          <>
            <b className="text-[#d97706]">Reactivate to keep your streak</b> — it resets if payment isn&apos;t updated.
          </>
        ) : (
          <>
            <b className="text-primary-token dark:text-white">+250 free entries</b> unlock at {STREAK_GOAL} months
            {toGo > 0 ? ` — ${toGo} to go.` : " — unlocked!"} Keep your membership active.
          </>
        )}
      </p>
    </section>
  );
}
