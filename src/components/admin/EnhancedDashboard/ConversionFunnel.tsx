"use client";

import React from "react";
import type { EnhancedDashboardMetrics } from "@/types/admin/EnhancedMetrics";
import { formatNumber, formatPercentage } from "@/utils/metrics/formatters";

export interface ConversionFunnelProps {
  data: EnhancedDashboardMetrics["conversionFunnel"];
  loading?: boolean;
}

export function ConversionFunnel({ data, loading = false }: ConversionFunnelProps) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 dark:bg-neutral-700 rounded w-1/3" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-200 dark:bg-neutral-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const stages = [
    {
      label: "Visitors",
      value: data.visitors,
      percentage: 100,
      color: "bg-blue-500",
    },
    {
      label: "Signups",
      value: data.signups,
      percentage: data.conversionRates.visitorToSignup,
      color: "bg-purple-500",
    },
    {
      label: "Paying Customers",
      value: data.payingCustomers,
      percentage: data.conversionRates.overall,
      color: "bg-emerald-500",
    },
  ];

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Conversion Funnel</h3>
      <div className="space-y-4">
        {stages.map((stage, index) => (
          <div key={stage.label} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-neutral-200">{stage.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                  {formatNumber(stage.value)}
                </span>
                {index > 0 && (
                  <span className="text-xs text-gray-500 dark:text-neutral-400">
                    ({formatPercentage(stage.percentage)})
                  </span>
                )}
              </div>
            </div>
            <div className="w-full bg-gray-200 dark:bg-neutral-800 rounded-full h-6 relative overflow-hidden">
              <div
                className={`${stage.color} h-6 rounded-full flex items-center justify-end pr-2 transition-all duration-500`}
                style={{ width: `${stage.percentage}%` }}
              >
                {stage.percentage > 10 && (
                  <span className="text-xs text-white font-semibold">{formatPercentage(stage.percentage)}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-gray-600 dark:text-neutral-400">Visitor → Signup</div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white">
              {formatPercentage(data.conversionRates.visitorToSignup)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-600 dark:text-neutral-400">Signup → Paying</div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white">
              {formatPercentage(data.conversionRates.signupToPaying)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-600 dark:text-neutral-400">Overall</div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white">
              {formatPercentage(data.conversionRates.overall)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

