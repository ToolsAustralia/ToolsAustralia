"use client";

import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { MonthlyComparisonData } from "@/types/metrics/MonthlyComparison";
import { format } from "date-fns";

export interface MetricsComparisonChartProps {
  data: MonthlyComparisonData;
  metric: "revenue" | "adSpend" | "profit" | "salesCount" | "conversions";
  height?: number;
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
    payload?: {
      name?: string;
    };
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
            {entry.name}: {entry.dataKey.includes("revenue") || entry.dataKey.includes("adSpend") || entry.dataKey.includes("profit")
              ? formatCurrency(entry.value)
              : formatNumber(entry.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function MetricsComparisonChart({
  data,
  metric,
  height = 400,
}: MetricsComparisonChartProps) {
  // Combine current and previous month data for comparison
  const maxLength = Math.max(data.currentMonth.length, data.previousMonth.length);
  const chartData = [];

  for (let i = 0; i < maxLength; i++) {
    const current = data.currentMonth[i];
    const previous = data.previousMonth[i];

    const day = i + 1;
    chartData.push({
      day: `Day ${day}`,
      current: current ? current[metric] : null,
      previous: previous ? previous[metric] : null,
      currentDate: current ? format(new Date(current.date), "MMM d") : null,
      previousDate: previous ? format(new Date(previous.date), "MMM d") : null,
    });
  }

  const colorMap: Record<string, string> = {
    revenue: "#10b981",
    adSpend: "#ef4444",
    profit: "#3b82f6",
    salesCount: "#8b5cf6",
    conversions: "#f59e0b",
  };

  const nameMap: Record<string, string> = {
    revenue: "Revenue",
    adSpend: "Ad Spend",
    profit: "Profit",
    salesCount: "Sales",
    conversions: "Conversions",
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={chartData}
        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="day"
          stroke="#6b7280"
          style={{ fontSize: "12px" }}
        />
        <YAxis
          stroke="#6b7280"
          style={{ fontSize: "12px" }}
          tickFormatter={(value) => 
            metric === "revenue" || metric === "adSpend" || metric === "profit"
              ? `$${value.toLocaleString()}`
              : value.toLocaleString()
          }
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Line
          type="monotone"
          dataKey="current"
          stroke={colorMap[metric]}
          strokeWidth={2}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
          name="Current Month"
        />
        <Line
          type="monotone"
          dataKey="previous"
          stroke="#9ca3af"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
          name="Previous Month"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}



