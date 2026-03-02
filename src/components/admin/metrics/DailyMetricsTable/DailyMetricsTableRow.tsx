"use client";

import React from "react";
import type { IDailyMetrics } from "@/types/metrics/DailyMetrics";
import { formatCurrency, formatNumber, formatROAS } from "@/utils/metrics/formatters";
import { formatInTimeZone } from "date-fns-tz";

const AEST_TIMEZONE = "Australia/Sydney";

export interface DailyMetricsTableRowProps {
  metric: IDailyMetrics;
}

export function DailyMetricsTableRow({ metric }: DailyMetricsTableRowProps) {
  const date = new Date(metric.date);
  // Format date in AEST timezone to ensure correct day is displayed
  // The date stored is UTC representation of AEST midnight, so we need to format it in AEST
  const formattedDate = formatInTimeZone(date, AEST_TIMEZONE, "d MMM yyyy");

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="py-3 px-4 text-sm text-gray-900 font-medium">{formattedDate}</td>
      <td className="py-3 px-4 text-sm text-right text-gray-900 font-semibold">{formatCurrency(metric.adSpend)}</td>
      <td className="py-3 px-4 text-sm text-right text-gray-900 font-semibold">{formatCurrency(metric.revenue)}</td>
      <td className="py-3 px-4 text-sm text-right text-gray-900 font-medium">{formatNumber(metric.salesCount)}</td>
      <td
        className={`py-3 px-4 text-sm text-right font-semibold ${
          metric.profit >= 0 ? "text-emerald-600" : "text-red-600"
        }`}
      >
        {formatCurrency(metric.profit)}
      </td>
      <td className="py-3 px-4 text-sm text-right text-gray-900 font-semibold">{formatROAS(metric.roas)}</td>
      <td className="py-3 px-4 text-sm text-right text-gray-900 font-medium">{formatNumber(metric.conversions)}</td>
    </tr>
  );
}

