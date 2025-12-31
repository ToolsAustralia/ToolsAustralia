"use client";

import React from "react";
import type { IDailyMetrics } from "@/types/metrics/DailyMetrics";
import { formatCurrency, formatNumber, formatROAS } from "@/utils/metrics/formatters";
import { format } from "date-fns";

export interface DailyBreakdownChartProps {
  metrics: IDailyMetrics[];
  loading?: boolean;
}

export function DailyBreakdownChart({ metrics, loading = false }: DailyBreakdownChartProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 text-center">
        <p className="text-gray-600">No daily breakdown data available.</p>
      </div>
    );
  }

  const maxRevenue = Math.max(...metrics.map((m) => m.revenue), 1);

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Performance Breakdown</h3>
      <div className="space-y-3">
        {metrics.map((metric) => {
          const date = new Date(metric.date);
          return (
            <div key={metric._id || date.toISOString()} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{format(date, "MMM d, yyyy")}</span>
                <div className="flex items-center gap-4 text-xs text-gray-600">
                  <span>Spend: {formatCurrency(metric.adSpend)}</span>
                  <span>Revenue: {formatCurrency(metric.revenue)}</span>
                  <span>ROAS: {formatROAS(metric.roas)}</span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 relative overflow-hidden">
                <div
                  className="bg-emerald-600 h-4 rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                  style={{ width: `${(metric.revenue / maxRevenue) * 100}%` }}
                >
                  {metric.revenue / maxRevenue > 0.15 && (
                    <span className="text-xs text-white font-semibold">{formatCurrency(metric.revenue)}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

