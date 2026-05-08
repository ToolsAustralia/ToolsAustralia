"use client";

import React from "react";
import type { AdminDashboardStats } from "@/hooks/queries/useAdminQueries";

export type MembershipRenewalsSummary = NonNullable<AdminDashboardStats["users"]["membershipRenewals"]>;

interface MembershipRenewalPeriodStatsProps {
  membershipRenewals?: MembershipRenewalsSummary;
  statsLoading?: boolean;
}

/** Typography aligned with MetricCard: value `text-sm sm:text-lg…`, label `text-2xs sm:text-sm` */
export default function MembershipRenewalPeriodStats({
  membershipRenewals,
  statsLoading = false,
}: MembershipRenewalPeriodStatsProps) {
  if (statsLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-gray-500 dark:text-neutral-400 text-2xs sm:text-xs">
        <span className="inline-block size-3.5 sm:size-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin shrink-0" />
        Loading period renewal stats…
      </div>
    );
  }

  if (!membershipRenewals) {
    return (
      <p className="text-2xs sm:text-xs text-gray-500 dark:text-neutral-400 py-3">
        No renewal metrics available for this period.
      </p>
    );
  }

  const cards: { label: string; value: string; valueClass?: string }[] = [
    { label: "Renewals due", value: membershipRenewals.expectedInRange.toLocaleString() },
    {
      label: "Paid renewals",
      value: membershipRenewals.succeededInRange.toLocaleString(),
      valueClass: "text-emerald-700 dark:text-emerald-400",
    },
    {
      label: "New past due",
      value: membershipRenewals.becamePastDueInRange.toLocaleString(),
      valueClass:
        membershipRenewals.becamePastDueInRange > 0
          ? "text-amber-700 dark:text-amber-400"
          : undefined,
    },
  ];

  return (
    <div className="space-y-2.5 sm:space-y-3">
      <p className="text-2xs sm:text-2xs text-gray-500 dark:text-neutral-400 leading-snug">
        Totals use the <span className="font-medium text-gray-700 dark:text-neutral-300">dashboard date range</span> (toolbar
        above), not the Today / 3d window on the other tab.
      </p>
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {cards.map((item) => (
          <div
            key={item.label}
            className="rounded-lg sm:rounded-xl border border-gray-200/90 dark:border-neutral-700 bg-white dark:bg-neutral-900/80 px-1.5 py-2 sm:px-2.5 sm:py-2.5 shadow-sm dark:shadow-none ring-1 ring-black/[0.03] dark:ring-white/[0.06]"
          >
            <div className="text-3xs sm:text-2xs font-medium text-gray-500 dark:text-neutral-400 leading-tight line-clamp-2 min-h-[2em] sm:min-h-0">
              {item.label}
            </div>
            <div
              className={`text-sm sm:text-lg font-bold tabular-nums text-gray-900 dark:text-white mt-0.5 sm:mt-1 tracking-tight ${item.valueClass ?? ""}`}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
