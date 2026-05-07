"use client";

import React from "react";
import type { UserMetrics, MembershipPackageBreakdown } from "@/types/metrics/UserMetrics";

export interface MembershipPackageBreakdownTableProps {
  data: UserMetrics["membershipByPackage"];
}

interface RowTotals {
  total: number;
  active: number;
  pastDue: number;
  cancelled: number;
}

function sumRows(rows: MembershipPackageBreakdown[]): RowTotals {
  return rows.reduce<RowTotals>(
    (acc, r) => ({
      total: acc.total + r.total,
      active: acc.active + r.active,
      pastDue: acc.pastDue + r.pastDue,
      cancelled: acc.cancelled + r.cancelled,
    }),
    { total: 0, active: 0, pastDue: 0, cancelled: 0 }
  );
}

function pct(value: number, total: number): string {
  if (total === 0) return "—";
  return `${((value / total) * 100).toFixed(1)}%`;
}

export function MembershipPackageBreakdownTable({ data }: MembershipPackageBreakdownTableProps) {
  // Sort by total desc so the most-popular package is first.
  const rows = [...data].sort((a, b) => b.total - a.total);
  const totals = sumRows(rows);

  if (rows.length === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-6 text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Membership by Package</h3>
        <p className="text-gray-600 dark:text-neutral-400">No subscription package data available.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-3 sm:p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Membership by Package</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800">
              <th className="text-left py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">Package</th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">Members</th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-emerald-700 dark:text-emerald-400">Active</th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-amber-700 dark:text-amber-400">Past Due</th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-red-700 dark:text-red-400">Cancelled</th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">Active %</th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">Past Due %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.packageId} className="border-b border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors">
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-gray-900 dark:text-white font-medium">{row.packageName}</td>
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-right text-gray-900 dark:text-white font-semibold tabular-nums">{row.total.toLocaleString()}</td>
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-right text-emerald-700 dark:text-emerald-400 tabular-nums">{row.active.toLocaleString()}</td>
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-right text-amber-700 dark:text-amber-400 tabular-nums">{row.pastDue.toLocaleString()}</td>
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-right text-red-700 dark:text-red-400 tabular-nums">{row.cancelled.toLocaleString()}</td>
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-right text-gray-600 dark:text-neutral-400 tabular-nums">{pct(row.active, row.total)}</td>
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-right text-gray-600 dark:text-neutral-400 tabular-nums">{pct(row.pastDue, row.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-800">
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm font-bold text-gray-900 dark:text-white">All Packages</td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-right font-bold text-gray-900 dark:text-white tabular-nums">{totals.total.toLocaleString()}</td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-right font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{totals.active.toLocaleString()}</td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-right font-bold text-amber-700 dark:text-amber-400 tabular-nums">{totals.pastDue.toLocaleString()}</td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-right font-bold text-red-700 dark:text-red-400 tabular-nums">{totals.cancelled.toLocaleString()}</td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-right font-bold text-gray-600 dark:text-neutral-400 tabular-nums">{pct(totals.active, totals.total)}</td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-sm text-right font-bold text-gray-600 dark:text-neutral-400 tabular-nums">{pct(totals.pastDue, totals.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
