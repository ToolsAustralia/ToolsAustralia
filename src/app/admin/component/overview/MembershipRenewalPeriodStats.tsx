"use client";

import React from "react";
import type { AdminDashboardStats } from "@/hooks/queries/useAdminQueries";

export type MembershipRenewalsSummary = NonNullable<AdminDashboardStats["users"]["membershipRenewals"]>;

interface MembershipRenewalPeriodStatsProps {
  membershipRenewals?: MembershipRenewalsSummary;
  statsLoading?: boolean;
}

export default function MembershipRenewalPeriodStats({
  membershipRenewals,
  statsLoading = false,
}: MembershipRenewalPeriodStatsProps) {
  if (statsLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-gray-500 dark:text-neutral-400 text-xs sm:text-sm">
        <span className="inline-block size-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin shrink-0" />
        Loading period renewal stats…
      </div>
    );
  }

  if (!membershipRenewals) {
    return (
      <p className="text-xs sm:text-sm text-gray-500 dark:text-neutral-400 py-4">
        No renewal metrics available for this period.
      </p>
    );
  }

  const items: { label: string; value: string; valueClass?: string; sub?: string }[] = [
    {
      label: "Renewals due",
      value: membershipRenewals.expectedInRange.toLocaleString(),
    },
    {
      label: "Paid (renewals)",
      value: membershipRenewals.succeededInRange.toLocaleString(),
      valueClass: "text-emerald-700 dark:text-emerald-400",
    },
    {
      label: "Distinct members paid",
      value: membershipRenewals.succeededDistinctMembers.toLocaleString(),
      sub: "Unique accounts with a successful renewal in range",
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

  if (membershipRenewals.failedInvoicesInRange > 0) {
    items.push({
      label: "Failed renewal invoices",
      value: membershipRenewals.failedInvoicesInRange.toLocaleString(),
      valueClass: "text-red-600 dark:text-red-400",
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] sm:text-xs text-gray-500 dark:text-neutral-400 leading-snug">
        These totals follow the <span className="font-medium text-gray-700 dark:text-neutral-300">dashboard date range</span>{" "}
        (toolbar at the top), not the Today / 3d / 7d window on the other tab.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50/80 dark:bg-neutral-800/50 px-3 py-2.5 sm:py-3"
          >
            <div className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-neutral-400 uppercase tracking-wide">
              {item.label}
            </div>
            <div
              className={`text-lg sm:text-xl font-bold tabular-nums text-gray-900 dark:text-white mt-0.5 ${item.valueClass ?? ""}`}
            >
              {item.value}
            </div>
            {item.sub && (
              <p className="text-[10px] text-gray-500 dark:text-neutral-500 mt-1 leading-snug">{item.sub}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
