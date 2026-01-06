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
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 text-center">
        <p className="text-gray-600">No daily user metrics data available.</p>
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
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-6">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <th className="text-left py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700">
                Date
              </th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700">
                New Signups
              </th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700">
                Active
              </th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700">
                Renewed
              </th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700">
                Cancelled
              </th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700">
                Purchases
              </th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700">
                Revenue
              </th>
              <th className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700">
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
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-semibold">
                  {day.newSignups.toLocaleString()}
                </td>
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-semibold">
                  {day.activeMemberships.toLocaleString()}
                </td>
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-emerald-600 font-semibold">
                  {day.renewedMemberships.toLocaleString()}
                </td>
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-red-600 font-semibold">
                  {day.cancelledMemberships.toLocaleString()}
                </td>
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-semibold">
                  {day.totalPurchases.toLocaleString()}
                </td>
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-semibold">
                  ${day.totalRevenue.toLocaleString("en-AU", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-semibold">
                  ${day.averageOrderValue.toLocaleString("en-AU", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
              </tr>
            ))}
            {/* Totals Row */}
            <tr className="border-t-2 border-gray-300 bg-gray-100 font-bold">
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-gray-900">Total</td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900">
                {totals.newSignups.toLocaleString()}
              </td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900">
                {totals.activeMemberships.toLocaleString()}
              </td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-emerald-600">
                {totals.renewedMemberships.toLocaleString()}
              </td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-red-600">
                {totals.cancelledMemberships.toLocaleString()}
              </td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900">
                {totals.totalPurchases.toLocaleString()}
              </td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900">
                ${totals.totalRevenue.toLocaleString("en-AU", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
              <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900">
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

