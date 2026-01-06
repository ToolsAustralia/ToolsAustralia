"use client";

import React, { useState } from "react";
import type { MonthlyComparisonData } from "@/types/metrics/MonthlyComparison";
import { MetricsComparisonChart } from "../charts/MetricsComparisonChart";

export interface MonthlyComparisonChartProps {
  data: MonthlyComparisonData;
}

export function MonthlyComparisonChart({ data }: MonthlyComparisonChartProps) {
  const [selectedMetric, setSelectedMetric] = useState<"revenue" | "adSpend" | "profit" | "salesCount" | "conversions">("revenue");

  const metrics = [
    { value: "revenue" as const, label: "Revenue" },
    { value: "adSpend" as const, label: "Ad Spend" },
    { value: "profit" as const, label: "Profit" },
    { value: "salesCount" as const, label: "Sales" },
    { value: "conversions" as const, label: "Conversions" },
  ];

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Monthly Comparison</h3>
        <div className="flex flex-wrap gap-2">
          {metrics.map((metric) => (
            <button
              key={metric.value}
              onClick={() => setSelectedMetric(metric.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedMetric === metric.value
                  ? "bg-red-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {metric.label}
            </button>
          ))}
        </div>
      </div>
      <div className="w-full">
        <MetricsComparisonChart data={data} metric={selectedMetric} height={400} />
      </div>
    </div>
  );
}

