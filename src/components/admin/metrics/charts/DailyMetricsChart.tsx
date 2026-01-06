"use client";

import React from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { IDailyMetrics } from "@/types/metrics/DailyMetrics";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

const AEST_TIMEZONE = "Australia/Sydney";

export interface DailyMetricsChartProps {
  metrics: IDailyMetrics[];
  type?: "line" | "area" | "bar";
  metricsToShow?: Array<"revenue" | "adSpend" | "profit" | "salesCount" | "conversions">;
  height?: number;
  breakdownLevel?: "account" | "campaign" | "adset" | "ad";
  breakdownId?: string;
}

const formatCurrency = (value: number) => `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatNumber = (value: number) => value.toLocaleString("en-AU");

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    dataKey: string;
    color: string;
  }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
        <p className="font-semibold text-gray-900 mb-2">{label}</p>
        {payload.map((entry, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {entry.dataKey === "revenue" || entry.dataKey === "adSpend" || entry.dataKey === "profit" 
              ? formatCurrency(entry.value)
              : formatNumber(entry.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function DailyMetricsChart({
  metrics,
  type = "line",
  metricsToShow = ["revenue", "adSpend", "profit"],
  height = 400,
  breakdownLevel,
  breakdownId,
}: DailyMetricsChartProps) {
  // Filter metrics by breakdown if provided
  const filteredMetrics = React.useMemo(() => {
    if (!breakdownLevel || breakdownLevel === "account") {
      return metrics;
    }

    if (breakdownId) {
      return metrics.filter((metric) => {
        if (!metric.breakdown) return false;
        if (breakdownLevel === "campaign") {
          return metric.breakdown.campaignId === breakdownId;
        } else if (breakdownLevel === "adset") {
          return metric.breakdown.adsetId === breakdownId;
        } else if (breakdownLevel === "ad") {
          return metric.breakdown.adId === breakdownId;
        }
        return true;
      });
    }

    // If breakdown level specified but no ID, return all metrics at that level
    return metrics.filter((metric) => metric.level === breakdownLevel);
  }, [metrics, breakdownLevel, breakdownId]);

  // Transform data for chart
  // Format dates in AEST timezone to ensure correct day is displayed
  const chartData = filteredMetrics.map((metric) => {
    const metricDate = new Date(metric.date);
    return {
      date: formatInTimeZone(metricDate, AEST_TIMEZONE, "MMM d"),
      fullDate: formatInTimeZone(metricDate, AEST_TIMEZONE, "yyyy-MM-dd"),
      revenue: metric.revenue,
      adSpend: metric.adSpend,
      profit: metric.profit,
      salesCount: metric.salesCount,
      conversions: metric.conversions,
    };
  });

  const colorMap: Record<string, string> = {
    revenue: "#10b981", // emerald-500
    adSpend: "#ef4444", // red-500
    profit: "#3b82f6", // blue-500
    salesCount: "#8b5cf6", // violet-500
    conversions: "#f59e0b", // amber-500
  };

  const nameMap: Record<string, string> = {
    revenue: "Revenue",
    adSpend: "Ad Spend",
    profit: "Profit",
    salesCount: "Sales",
    conversions: "Conversions",
  };

  const commonProps = {
    data: chartData,
    margin: { top: 10, right: 30, left: 0, bottom: 0 },
  };

  if (type === "area") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart {...commonProps}>
          <defs>
            {metricsToShow.map((metric) => (
              <linearGradient key={metric} id={`color${metric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colorMap[metric]} stopOpacity={0.8} />
                <stop offset="95%" stopColor={colorMap[metric]} stopOpacity={0.1} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            stroke="#6b7280"
            style={{ fontSize: "12px" }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis
            stroke="#6b7280"
            style={{ fontSize: "12px" }}
            tickFormatter={(value) => `$${value.toLocaleString()}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {metricsToShow.map((metric) => (
            <Area
              key={metric}
              type="monotone"
              dataKey={metric}
              stroke={colorMap[metric]}
              fill={`url(#color${metric})`}
              name={nameMap[metric]}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (type === "bar") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            stroke="#6b7280"
            style={{ fontSize: "12px" }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis
            stroke="#6b7280"
            style={{ fontSize: "12px" }}
            tickFormatter={(value) => `$${value.toLocaleString()}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {metricsToShow.map((metric) => (
            <Bar key={metric} dataKey={metric} fill={colorMap[metric]} name={nameMap[metric]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // Default to line chart
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart {...commonProps}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="date"
          stroke="#6b7280"
          style={{ fontSize: "12px" }}
          angle={-45}
          textAnchor="end"
          height={80}
        />
        <YAxis
          stroke="#6b7280"
          style={{ fontSize: "12px" }}
          tickFormatter={(value) => `$${value.toLocaleString()}`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        {metricsToShow.map((metric) => (
          <Line
            key={metric}
            type="monotone"
            dataKey={metric}
            stroke={colorMap[metric]}
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            name={nameMap[metric]}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}


