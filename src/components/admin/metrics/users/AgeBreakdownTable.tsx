"use client";

import React from "react";
import type { UserMetrics } from "@/types/metrics/UserMetrics";
import { AGE_GROUP_ORDER } from "@/utils/metrics/age-grouping";

export interface AgeBreakdownTableProps {
  data: UserMetrics["ageGroup"];
}

export function AgeBreakdownTable({ data }: AgeBreakdownTableProps) {
  const total = AGE_GROUP_ORDER.reduce((sum, label) => sum + (data[label] ?? 0), 0);

  if (total === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-6 text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Age Group Breakdown</h3>
        <p className="text-gray-600 dark:text-neutral-400">No age data available.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-3 sm:p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Age Group Breakdown</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800">
              <th className="text-left py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">Age Group</th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">Users</th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {AGE_GROUP_ORDER.map((label) => {
              const value = data[label] ?? 0;
              const pct = total > 0 ? (value / total) * 100 : 0;
              return (
                <tr key={label} className="border-b border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors">
                  <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-gray-900 dark:text-white font-medium">{label}</td>
                  <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-right text-gray-900 dark:text-white tabular-nums">{value.toLocaleString()}</td>
                  <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-right text-gray-600 dark:text-neutral-400 tabular-nums">{pct.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-800">
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm font-bold text-gray-900 dark:text-white">Total</td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-right font-bold text-gray-900 dark:text-white tabular-nums">{total.toLocaleString()}</td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-right font-bold text-gray-600 dark:text-neutral-400 tabular-nums">100.0%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
