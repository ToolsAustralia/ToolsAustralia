"use client";

import React from "react";
import type { MonthlyComparisonData } from "@/types/metrics/MonthlyComparison";
import { formatCurrency, formatNumber, formatROAS, formatPercentageChange } from "@/utils/metrics/formatters";
import { TrendIndicator } from "../shared/TrendIndicator";

export interface MonthlyComparisonTableProps {
  data: MonthlyComparisonData;
}

export function MonthlyComparisonTable({ data }: MonthlyComparisonTableProps) {
  const { currentMonthTotal, previousMonthTotal, comparison } = data;

  const metrics = [
    {
      label: "Ad Spend",
      current: currentMonthTotal.adSpend,
      previous: previousMonthTotal.adSpend,
      comparison: comparison.adSpend,
      format: formatCurrency,
    },
    {
      label: "Revenue",
      current: currentMonthTotal.revenue,
      previous: previousMonthTotal.revenue,
      comparison: comparison.revenue,
      format: formatCurrency,
    },
    {
      label: "Sales Count",
      current: currentMonthTotal.salesCount,
      previous: previousMonthTotal.salesCount,
      comparison: comparison.salesCount,
      format: formatNumber,
    },
    {
      label: "Profit",
      current: currentMonthTotal.profit,
      previous: previousMonthTotal.profit,
      comparison: comparison.profit,
      format: formatCurrency,
    },
    {
      label: "ROAS",
      current: currentMonthTotal.roas,
      previous: previousMonthTotal.roas,
      comparison: comparison.roas,
      format: formatROAS,
    },
    {
      label: "Conversions",
      current: currentMonthTotal.conversions,
      previous: previousMonthTotal.conversions,
      comparison: comparison.conversions,
      format: formatNumber,
    },
  ];

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Comparison</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <th className="text-left py-3 px-4 text-xs sm:text-sm font-semibold text-gray-700">Metric</th>
              <th className="text-right py-3 px-4 text-xs sm:text-sm font-semibold text-gray-700">Current Month</th>
              <th className="text-right py-3 px-4 text-xs sm:text-sm font-semibold text-gray-700">Previous Month</th>
              <th className="text-right py-3 px-4 text-xs sm:text-sm font-semibold text-gray-700">Change</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr key={metric.label} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="py-3 px-4 text-sm text-gray-900 font-medium">{metric.label}</td>
                <td className="py-3 px-4 text-sm text-right text-gray-900 font-semibold">
                  {metric.format(metric.current)}
                </td>
                <td className="py-3 px-4 text-sm text-right text-gray-600">{metric.format(metric.previous)}</td>
                <td className="py-3 px-4 text-sm text-right">
                  <div className="flex items-center justify-end gap-2">
                    <TrendIndicator
                      value={metric.comparison.percentage}
                      direction={metric.comparison.direction}
                    />
                    <span className="text-xs text-gray-600">
                      {formatPercentageChange(metric.comparison.value, metric.label.includes("$") ? 2 : 0)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

