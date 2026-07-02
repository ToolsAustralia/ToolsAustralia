"use client";

import { Medal, Check, Lock } from "lucide-react";
import { cn } from "@/utils/cn";
import { glossGrad, inkOn } from "@/utils/membership/tier-visuals";
import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";

interface RewardsMilestonesProps {
  acct: DashboardAccountState;
  /** Months of continuous membership (real member-since data). */
  months: number | null;
  /** Owned tier hex — themes the header banner (Tradie / Foreman / Boss). */
  tierHex?: string | null;
}

// Documented loyalty milestones (source: rewards domain). No fabricated amounts.
const MILESTONES = [
  { mo: 3, entries: 50 },
  { mo: 6, entries: 250 },
];
const MAX_MO = MILESTONES[MILESTONES.length - 1].mo;

/**
 * Loyalty milestones — a package-themed header banner (Tradie / Foreman / Boss)
 * stating the next reward + months-to-go, over a visual progress track showing
 * where the member currently sits. Driven by real continuous-membership `months`;
 * amounts are documented constants, never fabricated. Member perk only.
 */
export default function RewardsMilestones({ acct, months, tierHex }: RewardsMilestonesProps) {
  if (acct !== "active" && acct !== "pastdue") return null;

  const m = Math.max(months ?? 0, 0);
  const progressPct = Math.min(m / MAX_MO, 1) * 100;
  const nextMilestone = MILESTONES.find((ms) => ms.mo > m) ?? null;

  const hex = tierHex ?? "#d4af37";
  const ink = inkOn(hex);
  const chipBg = ink === "#0a0a0a" ? "rgba(0,0,0,.13)" : "rgba(255,255,255,.16)";

  // Header banner copy by state (replaces the old descriptive paragraph).
  const banner =
    acct === "pastdue"
      ? { title: "Reactivate to keep your streak", subtitle: "Milestone progress pauses while payment is overdue", right: null }
      : nextMilestone
        ? { title: `Next: +${nextMilestone.entries} free entries`, subtitle: `Unlocks at your ${nextMilestone.mo}-month milestone`, right: { m, of: nextMilestone.mo } }
        : { title: "All milestones unlocked", subtitle: `Thanks for ${m} months of membership`, right: null };

  return (
    <section className="overflow-hidden rounded-3xl border border-token bg-surface shadow-sm">
      {/* Package-themed header banner */}
      <div className="relative flex items-center gap-3 px-4 py-3.5" style={{ background: glossGrad(hex), color: ink }}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: chipBg }}>
          <Medal className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-['Poppins'] text-[15px] font-extrabold leading-tight">{banner.title}</div>
          <div className="mt-0.5 text-[11px] font-semibold opacity-80">{banner.subtitle}</div>
        </div>
        {banner.right && (
          <div className="shrink-0 text-right leading-none">
            <span className="num font-['Poppins'] text-xl font-black">{banner.right.m}</span>
            <span className="text-[11px] font-bold opacity-80"> /{banner.right.of} mo</span>
          </div>
        )}
      </div>

      {/* Visual track: current position + milestone nodes. The node captions hang
          below the bar (absolute), so the bottom padding must clear them — the card
          is `overflow-hidden` (to round the banner) and would otherwise clip them. */}
      <div className="px-6 pb-14 pt-8">
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
    </section>
  );
}
