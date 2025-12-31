"use client";

import React, { useState, useMemo } from "react";
import { useMonthlyComparison } from "@/hooks/useMonthlyComparison";
import { useViewMode } from "@/hooks/useViewMode";
import { MonthlyComparison } from "./MonthlyComparison/MonthlyComparison";
import { DailyMetricsTable } from "./DailyMetricsTable/DailyMetricsTable";
import { ViewSwitcher } from "./shared/ViewSwitcher";
import { MetricsErrorBoundary } from "./ErrorBoundary";
import { format } from "date-fns";

export interface DailyMetricsViewProps {
  initialMonth?: string; // YYYY-MM format
}

export function DailyMetricsView({ initialMonth }: DailyMetricsViewProps) {
  // Get current month if not provided
  const currentMonth = useMemo(() => {
    if (initialMonth) {
      return initialMonth;
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, [initialMonth]);

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const { viewMode, changeViewMode } = useViewMode("table");

  // Fetch monthly comparison data
  const { data, isLoading, error } = useMonthlyComparison({
    month: selectedMonth,
    enabled: true,
  });

  // Generate month options (last 12 months)
  const monthOptions = useMemo(() => {
    const options: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push(format(date, "yyyy-MM"));
    }
    return options;
  }, []);

  // Format month for display
  const formatMonthDisplay = (month: string) => {
    const [year, monthNum] = month.split("-");
    const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    return format(date, "MMMM yyyy");
  };

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <p className="text-red-700">Error loading metrics: {error instanceof Error ? error.message : "Unknown error"}</p>
      </div>
    );
  }

  return (
    <MetricsErrorBoundary>
      <div className="space-y-4 sm:space-y-6">
      {/* Header with Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">Daily Metrics</h2>
        <div className="flex flex-row items-center gap-2 sm:gap-3 w-full sm:w-auto">
          {/* Month Selector */}
          <div className="flex items-center gap-2 flex-1 sm:flex-none">
            <label htmlFor="month-select" className="text-sm font-medium text-gray-700 whitespace-nowrap hidden sm:inline">
              Month:
            </label>
            <select
              id="month-select"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm bg-white font-semibold text-gray-900 flex-1 sm:flex-none"
            >
              {monthOptions.map((month) => (
                <option key={month} value={month}>
                  {formatMonthDisplay(month)}
                </option>
              ))}
            </select>
          </div>

          {/* View Switcher */}
          <div className="flex-shrink-0">
            <ViewSwitcher currentView={viewMode} onViewChange={changeViewMode} />
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      ) : data ? (
        <>
          {viewMode === "table" && (
            <DailyMetricsTable metrics={[...data.currentMonth, ...data.previousMonth]} />
          )}
          {viewMode === "chart" && <MonthlyComparison data={data} viewMode="chart" />}
          {viewMode === "side-by-side" && <MonthlyComparison data={data} viewMode="side-by-side" />}
        </>
      ) : (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 text-center">
          <p className="text-gray-600 mb-2">No metrics data available for the selected period.</p>
          <p className="text-sm text-gray-500">
            Data will be automatically aggregated when you have payment events or Facebook ads data.
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Run <code className="bg-gray-100 px-1 rounded">npx tsx scripts/seed-daily-metrics.ts</code> to seed sample data for development.
          </p>
        </div>
      )}
      </div>
    </MetricsErrorBoundary>
  );
}

