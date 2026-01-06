"use client";

import React from "react";
import type { MajorDrawComparisonData } from "@/types/metrics/MajorDrawComparison";
import { formatCurrency, formatNumber, formatROAS, formatPercentageChange } from "@/utils/metrics/formatters";
import { TrendIndicator } from "../shared/TrendIndicator";
import { format } from "date-fns";

export interface MajorDrawComparisonTableProps {
  data: MajorDrawComparisonData;
}

export function MajorDrawComparisonTable({ data }: MajorDrawComparisonTableProps) {
  const { currentDrawTotal, previousDrawTotal, comparison, currentDrawInfo, previousDrawInfo } = data;

  const metrics = [
    {
      label: "Ad Spend",
      current: currentDrawTotal.adSpend,
      previous: previousDrawTotal.adSpend,
      comparison: comparison.adSpend,
      format: formatCurrency,
    },
    {
      label: "Revenue",
      current: currentDrawTotal.revenue,
      previous: previousDrawTotal.revenue,
      comparison: comparison.revenue,
      format: formatCurrency,
    },
    {
      label: "Sales Count",
      current: currentDrawTotal.salesCount,
      previous: previousDrawTotal.salesCount,
      comparison: comparison.salesCount,
      format: formatNumber,
    },
    {
      label: "Profit",
      current: currentDrawTotal.profit,
      previous: previousDrawTotal.profit,
      comparison: comparison.profit,
      format: formatCurrency,
    },
    {
      label: "ROAS",
      current: currentDrawTotal.roas,
      previous: previousDrawTotal.roas,
      comparison: comparison.roas,
      format: formatROAS,
    },
    {
      label: "Conversions",
      current: currentDrawTotal.conversions,
      previous: previousDrawTotal.conversions,
      comparison: comparison.conversions,
      format: formatNumber,
    },
  ];

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Major Draw Comparison</h3>
        <div className="flex flex-col sm:flex-row gap-4 text-sm text-gray-600">
          <div>
            <span className="font-semibold text-gray-900">Current: </span>
            {currentDrawInfo.name} ({format(new Date(currentDrawInfo.activationDate), "MMM d")} - {format(new Date(currentDrawInfo.drawDate), "MMM d, yyyy")})
          </div>
          <div>
            <span className="font-semibold text-gray-900">Previous: </span>
            {previousDrawInfo.name} ({format(new Date(previousDrawInfo.activationDate), "MMM d")} - {format(new Date(previousDrawInfo.drawDate), "MMM d, yyyy")})
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <th className="text-left py-3 px-4 text-xs sm:text-sm font-semibold text-gray-700">Metric</th>
              <th className="text-right py-3 px-4 text-xs sm:text-sm font-semibold text-gray-700">Current Draw</th>
              <th className="text-right py-3 px-4 text-xs sm:text-sm font-semibold text-gray-700">Previous Draw</th>
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
                      {formatPercentageChange(metric.comparison.value, metric.label.includes("$") || metric.label === "Ad Spend" || metric.label === "Revenue" || metric.label === "Profit" ? 2 : 0)}
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


