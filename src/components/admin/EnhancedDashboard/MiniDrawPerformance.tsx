"use client";

import React from "react";
import { MetricCard } from "../metrics/shared/MetricCard";
import { Trophy } from "lucide-react";
import type { EnhancedDashboardMetrics } from "@/types/admin/EnhancedMetrics";
import { formatCurrency, formatNumber } from "@/utils/metrics/formatters";

export interface MiniDrawPerformanceProps {
  data: EnhancedDashboardMetrics["miniDrawPerformance"];
  loading?: boolean;
}

export function MiniDrawPerformance({ data, loading = false }: MiniDrawPerformanceProps) {
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Mini Draw Performance</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Total Revenue"
          value={formatCurrency(data.totalRevenue)}
          subtitle="From mini draws"
          icon={Trophy}
          color="purple"
          loading={loading}
        />
        <MetricCard
          title="Total Sales"
          value={formatNumber(data.totalSales)}
          subtitle="Mini draw purchases"
          icon={Trophy}
          color="indigo"
          loading={loading}
        />
        <MetricCard
          title="Avg Revenue/Draw"
          value={formatCurrency(data.averageRevenuePerDraw)}
          subtitle="Average per draw"
          icon={Trophy}
          color="blue"
          loading={loading}
        />
      </div>
    </div>
  );
}

