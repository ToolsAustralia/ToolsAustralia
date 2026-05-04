"use client";

import React from "react";
import type { UserMetrics } from "@/types/metrics/UserMetrics";

export interface ProfessionBreakdownTableProps {
  data: UserMetrics["profession"];
}

export function ProfessionBreakdownTable({ data }: ProfessionBreakdownTableProps) {
  const rows = Object.entries(data)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  if (rows.length === 0 || total === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-6 text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Profession Breakdown</h3>
        <p className="text-gray-600 dark:text-neutral-400">No profession data available.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-3 sm:p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Profession Breakdown</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800">
              <th className="text-left py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100 w-12">#</th>
              <th className="text-left py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">Profession</th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">Users</th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const pct = total > 0 ? (row.count / total) * 100 : 0;
              return (
                <tr key={row.name} className="border-b border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors">
                  <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-gray-500 dark:text-neutral-500 tabular-nums">{idx + 1}</td>
                  <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-gray-900 dark:text-white font-medium">{row.name}</td>
                  <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-right text-gray-900 dark:text-white tabular-nums">{row.count.toLocaleString()}</td>
                  <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-right text-gray-600 dark:text-neutral-400 tabular-nums">{pct.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-800">
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm font-bold text-gray-900 dark:text-white" colSpan={2}>Total</td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-right font-bold text-gray-900 dark:text-white tabular-nums">{total.toLocaleString()}</td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-right font-bold text-gray-600 dark:text-neutral-400 tabular-nums">100.0%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
