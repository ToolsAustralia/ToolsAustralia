"use client";

import React from "react";
import type { MonthlyComparisonData } from "@/types/metrics/MonthlyComparison";
import { format } from "date-fns";

export interface MonthlyComparisonChartProps {
  data: MonthlyComparisonData;
}

export function MonthlyComparisonChart({ data }: MonthlyComparisonChartProps) {
  // This is a placeholder - in production, you'd use a charting library like recharts
  // For now, we'll show a simple visual representation
  
  const maxValue = Math.max(
    ...data.currentMonth.map((m) => m.revenue),
    ...data.previousMonth.map((m) => m.revenue),
    1
  );

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Revenue Comparison</h3>
      <div className="space-y-4">
        {data.currentMonth.map((day, index) => {
          const prevDay = data.previousMonth[index];
          const date = new Date(day.date);
          
          return (
            <div key={day._id || index} className="space-y-2">
              <div className="text-xs text-gray-600 font-medium">{format(date, "MMM d")}</div>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="w-16 text-xs text-gray-600">Current:</div>
                    <div className="flex-1 bg-gray-200 rounded-full h-4 relative">
                      <div
                        className="bg-emerald-600 h-4 rounded-full"
                        style={{ width: `${(day.revenue / maxValue) * 100}%` }}
                      ></div>
                      <span className="absolute left-2 top-0 text-xs text-white font-semibold">
                        ${day.revenue.toFixed(0)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="w-16 text-xs text-gray-600">Previous:</div>
                    <div className="flex-1 bg-gray-200 rounded-full h-4 relative">
                      <div
                        className="bg-blue-600 h-4 rounded-full"
                        style={{ width: `${prevDay ? (prevDay.revenue / maxValue) * 100 : 0}%` }}
                      ></div>
                      {prevDay && (
                        <span className="absolute left-2 top-0 text-xs text-white font-semibold">
                          ${prevDay.revenue.toFixed(0)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
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

