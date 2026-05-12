"use client";

import React from "react";
import type { UserMetrics } from "@/types/metrics/UserMetrics";

const EXCLUDED_KEY = "Other";

export interface ProfessionBreakdownTableProps {
  data: UserMetrics["profession"];
  /** When true, drops the card wrapper so the table can sit flush inside an outer container. */
  bare?: boolean;
}

export function ProfessionBreakdownTable({ data, bare = false }: ProfessionBreakdownTableProps) {
  const rows = Object.entries(data)
    .filter(([name]) => name !== EXCLUDED_KEY)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const excludedCount = data[EXCLUDED_KEY] ?? 0;
  const visibleTotal = rows.reduce((sum, r) => sum + r.count, 0);
  const grandTotal = visibleTotal + excludedCount;
  const excludedPct = grandTotal > 0 ? (excludedCount / grandTotal) * 100 : 0;

  const wrapperClass = bare
    ? ""
    : "bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-3 sm:p-5";

  if (rows.length === 0 && excludedCount === 0) {
    return (
      <div className={bare ? "" : `${wrapperClass} text-center`}>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Profession Breakdown</h3>
        <p className="text-gray-600 dark:text-neutral-400 text-xs">No profession data available.</p>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Profession Breakdown</h3>
        {excludedCount > 0 && (
          <span className="text-[11px] text-gray-500 dark:text-neutral-400">
            Other excluded: <span className="font-semibold text-gray-700 dark:text-neutral-200 tabular-nums">{excludedCount.toLocaleString()}</span>
            {" "}({excludedPct.toFixed(1)}% of all)
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/60">
              <th className="text-left py-1.5 px-2 font-semibold text-gray-700 dark:text-neutral-200 w-8">#</th>
              <th className="text-left py-1.5 px-2 font-semibold text-gray-700 dark:text-neutral-200">Profession</th>
              <th className="text-right py-1.5 px-2 font-semibold text-gray-700 dark:text-neutral-200">Users</th>
              <th className="text-right py-1.5 px-2 font-semibold text-gray-700 dark:text-neutral-200">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const pct = visibleTotal > 0 ? (row.count / visibleTotal) * 100 : 0;
              return (
                <tr key={row.name} className="border-b border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors">
                  <td className="py-1.5 px-2 text-gray-500 dark:text-neutral-500 tabular-nums">{idx + 1}</td>
                  <td className="py-1.5 px-2 text-gray-900 dark:text-white font-medium">{row.name}</td>
                  <td className="py-1.5 px-2 text-right text-gray-900 dark:text-white tabular-nums">{row.count.toLocaleString()}</td>
                  <td className="py-1.5 px-2 text-right text-gray-600 dark:text-neutral-400 tabular-nums">{pct.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-300 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-800/60">
              <td className="py-1.5 px-2 font-bold text-gray-900 dark:text-white" colSpan={2}>Total</td>
              <td className="py-1.5 px-2 text-right font-bold text-gray-900 dark:text-white tabular-nums">{visibleTotal.toLocaleString()}</td>
              <td className="py-1.5 px-2 text-right font-bold text-gray-600 dark:text-neutral-400 tabular-nums">100.0%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
