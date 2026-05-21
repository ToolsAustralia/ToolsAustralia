"use client";

import React from "react";
import { format } from "date-fns";
import type { IDailyUserMetrics } from "@/types/metrics/DailyUserMetrics";

interface DailyUserMetricsTableProps {
  metrics: IDailyUserMetrics[];
}

export function DailyUserMetricsTable({ metrics }: DailyUserMetricsTableProps) {
  if (metrics.length === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-6 text-center">
        <p className="text-gray-600 dark:text-neutral-400">No daily user metrics data available.</p>
      </div>
    );
  }

  // Calculate totals
  const totals = metrics.reduce(
    (acc, day) => ({
      totalUsers: acc.totalUsers + day.totalUsers,
      newSignups: acc.newSignups + day.newSignups,
      activeMemberships: acc.activeMemberships + day.activeMemberships,
      cancelledMemberships: acc.cancelledMemberships + day.cancelledMemberships,
      expiredMemberships: acc.expiredMemberships + day.expiredMemberships,
      renewedMemberships: acc.renewedMemberships + day.renewedMemberships,
      totalPurchases: acc.totalPurchases + day.totalPurchases,
      totalRevenue: acc.totalRevenue + day.totalRevenue,
    }),
    {
      totalUsers: 0,
      newSignups: 0,
      activeMemberships: 0,
      cancelledMemberships: 0,
      expiredMemberships: 0,
      renewedMemberships: 0,
      totalPurchases: 0,
      totalRevenue: 0,
    }
  );

  const averageOrderValue = totals.totalPurchases > 0 ? totals.totalRevenue / totals.totalPurchases : 0;

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-3 sm:p-6">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
            <tr className="border-b-2 border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800">
              <th className="text-left py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">
                Date
              </th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">
                New Signups
              </th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">
                Active
              </th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">
                Renewed
              </th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">
                Cancelled
              </th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">
                Purchases
              </th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">
                Revenue
              </th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">
                AOV
              </th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((day, index) => (
              <tr
                key={index}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors even:bg-gray-50/30"
              >
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-gray-900 font-medium">
                  {format(new Date(day.date), "MMM d, yyyy")}
                </td>
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 dark:text-white font-semibold tabular-nums">
                  {day.newSignups.toLocaleString()}
                </td>
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 dark:text-white font-semibold tabular-nums">
                  {day.activeMemberships.toLocaleString()}
                </td>
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                  {day.renewedMemberships.toLocaleString()}
                </td>
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-red-600 dark:text-red-400 font-semibold tabular-nums">
                  {day.cancelledMemberships.toLocaleString()}
                </td>
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 dark:text-white font-semibold tabular-nums">
                  {day.totalPurchases.toLocaleString()}
                </td>
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 dark:text-white font-semibold tabular-nums">
                  ${day.totalRevenue.toLocaleString("en-AU", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 dark:text-white font-semibold tabular-nums">
                  ${day.averageOrderValue.toLocaleString("en-AU", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
              </tr>
            ))}
            {/* Totals Row */}
            <tr className="border-t-2 border-gray-300 dark:border-neutral-600 bg-gray-100 dark:bg-neutral-800 font-bold">
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-gray-900 dark:text-white">Total</td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 dark:text-white tabular-nums">
                {totals.newSignups.toLocaleString()}
              </td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 dark:text-white tabular-nums">
                {totals.activeMemberships.toLocaleString()}
              </td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-emerald-600 dark:text-emerald-400 tabular-nums">
                {totals.renewedMemberships.toLocaleString()}
              </td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-red-600 dark:text-red-400 tabular-nums">
                {totals.cancelledMemberships.toLocaleString()}
              </td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 dark:text-white tabular-nums">
                {totals.totalPurchases.toLocaleString()}
              </td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 dark:text-white tabular-nums">
                ${totals.totalRevenue.toLocaleString("en-AU", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 dark:text-white tabular-nums">
                ${averageOrderValue.toLocaleString("en-AU", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}


