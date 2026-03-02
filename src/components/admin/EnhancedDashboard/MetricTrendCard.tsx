"use client";

import React, { memo } from "react";
import { MetricCard } from "../metrics/shared/MetricCard";
import type { LucideIcon } from "lucide-react";
import type { TrendData } from "@/types/admin/EnhancedMetrics";

export interface MetricTrendCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: "red" | "emerald" | "blue" | "purple" | "yellow" | "indigo" | "orange" | "pink";
  trend?: TrendData;
  loading?: boolean;
}

export const MetricTrendCard = memo<MetricTrendCardProps>(function MetricTrendCard({
  title,
  value,
  subtitle,
  icon,
  color = "blue",
  trend,
  loading = false,
}) {
  return (
    <MetricCard
      title={title}
      value={value}
      subtitle={subtitle}
      icon={icon}
      color={color}
      loading={loading}
      trend={
        trend
          ? {
              value: trend.percentageChange,
              direction: trend.direction,
            }
          : undefined
      }
    />
  );
});

MetricTrendCard.displayName = "MetricTrendCard";

