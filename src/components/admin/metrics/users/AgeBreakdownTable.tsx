"use client";

import React from "react";
import type { UserMetrics } from "@/types/metrics/UserMetrics";
import { AGE_GROUP_ORDER } from "@/utils/metrics/age-grouping";

const EXCLUDED_KEY = "Unknown" as const;

export interface AgeBreakdownTableProps {
  data: UserMetrics["ageGroup"];
  /** When true, drops the card wrapper so the table can sit flush inside an outer container. */
  bare?: boolean;
}

export function AgeBreakdownTable({ data, bare = false }: AgeBreakdownTableProps) {
  const visibleLabels = AGE_GROUP_ORDER.filter((l) => l !== EXCLUDED_KEY);

  const visibleTotal = visibleLabels.reduce((sum, label) => sum + (data[label] ?? 0), 0);
  const excludedUsers = data[EXCLUDED_KEY] ?? 0;
  const grandTotal = visibleTotal + excludedUsers;
  const excludedPct = grandTotal > 0 ? (excludedUsers / grandTotal) * 100 : 0;

  const wrapperClass = bare
    ? ""
    : "bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-3 sm:p-5";

  if (visibleTotal === 0 && excludedUsers === 0) {
    return (
      <div className={bare ? "" : `${wrapperClass} text-center`}>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Age Group Breakdown</h3>
        <p className="text-gray-600 dark:text-neutral-400 text-xs">No age data available.</p>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Age Group Breakdown</h3>
        {excludedUsers > 0 && (
          <span className="text-[11px] text-gray-500 dark:text-neutral-400">
            Unknown excluded: <span className="font-semibold text-gray-700 dark:text-neutral-200 tabular-nums">{excludedUsers.toLocaleString()}</span>
            {" "}({excludedPct.toFixed(1)}% of all)
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/60">
              <th className="text-left py-1.5 px-2 font-semibold text-gray-700 dark:text-neutral-200">Age</th>
              <th className="text-right py-1.5 px-2 font-semibold text-gray-700 dark:text-neutral-200">Users</th>
              <th className="text-right py-1.5 px-2 font-semibold text-gray-700 dark:text-neutral-200">%</th>
            </tr>
          </thead>
          <tbody>
            {visibleLabels.map((label) => {
              const value = data[label] ?? 0;
              const pct = visibleTotal > 0 ? (value / visibleTotal) * 100 : 0;
              return (
                <tr key={label} className="border-b border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors">
                  <td className="py-1.5 px-2 text-gray-900 dark:text-white font-medium">{label}</td>
                  <td className="py-1.5 px-2 text-right text-gray-900 dark:text-white tabular-nums">{value.toLocaleString()}</td>
                  <td className="py-1.5 px-2 text-right text-gray-600 dark:text-neutral-400 tabular-nums">{pct.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-300 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-800/60">
              <td className="py-1.5 px-2 font-bold text-gray-900 dark:text-white">Total</td>
              <td className="py-1.5 px-2 text-right font-bold text-gray-900 dark:text-white tabular-nums">{visibleTotal.toLocaleString()}</td>
              <td className="py-1.5 px-2 text-right font-bold text-gray-600 dark:text-neutral-400 tabular-nums">100.0%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
