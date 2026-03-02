"use client";

import React from "react";
import type { MonthlyComparisonData } from "@/types/metrics/MonthlyComparison";

export interface MetricsOverlayChartProps {
  data: MonthlyComparisonData;
  metric: "revenue" | "adSpend" | "profit" | "salesCount";
}

export function MetricsOverlayChart({ data, metric = "revenue" }: MetricsOverlayChartProps) {
  // Combine both months' data and sort by day of month
  const combinedData = [
    ...data.currentMonth.map((d) => ({ ...d, month: "current", day: new Date(d.date).getDate() })),
    ...data.previousMonth.map((d) => ({ ...d, month: "previous", day: new Date(d.date).getDate() })),
  ].sort((a, b) => a.day - b.day);

  const maxValue = Math.max(
    ...combinedData.map((d) => d[metric] as number),
    1
  );

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 capitalize">{metric} Overlay</h3>
      <div className="space-y-3">
        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
          const currentDay = data.currentMonth.find((d) => new Date(d.date).getDate() === day);
          const previousDay = data.previousMonth.find((d) => new Date(d.date).getDate() === day);

          if (!currentDay && !previousDay) {
            return null;
          }

          return (
            <div key={day} className="space-y-1">
              <div className="text-xs text-gray-600 font-medium">Day {day}</div>
              <div className="flex items-center gap-2">
                {currentDay && (
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="w-12 text-xs text-gray-600">Current:</div>
                      <div className="flex-1 bg-gray-200 rounded-full h-6 relative">
                        <div
                          className="bg-emerald-600 h-6 rounded-full flex items-center justify-end pr-2"
                          style={{ width: `${((currentDay[metric] as number) / maxValue) * 100}%` }}
                        >
                          <span className="text-xs text-white font-semibold">
                            {metric === "revenue" || metric === "adSpend" || metric === "profit"
                              ? `$${(currentDay[metric] as number).toFixed(0)}`
                              : (currentDay[metric] as number).toFixed(0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {previousDay && (
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="w-12 text-xs text-gray-600">Previous:</div>
                      <div className="flex-1 bg-gray-200 rounded-full h-6 relative">
                        <div
                          className="bg-blue-600 h-6 rounded-full flex items-center justify-end pr-2"
                          style={{ width: `${((previousDay[metric] as number) / maxValue) * 100}%` }}
                        >
                          <span className="text-xs text-white font-semibold">
                            {metric === "revenue" || metric === "adSpend" || metric === "profit"
                              ? `$${(previousDay[metric] as number).toFixed(0)}`
                              : (previousDay[metric] as number).toFixed(0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-emerald-600 rounded"></div>
          <span>Current Month</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-600 rounded"></div>
          <span>Previous Month</span>
        </div>
      </div>
    </div>
  );
}

