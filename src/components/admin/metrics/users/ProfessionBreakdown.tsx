"use client";

import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { UserMetrics } from "@/types/metrics/UserMetrics";

const EXCLUDED_KEY = "Other";

export interface ProfessionBreakdownProps {
  data: UserMetrics["profession"];
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload?: {
      name?: string;
    };
  }>;
}

const CustomTooltip = ({ active, payload }: TooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-lg dark:shadow-none p-3">
        <p className="font-semibold text-gray-900 dark:text-white">{payload[0].payload?.name}</p>
        <p className="text-sm text-gray-600 dark:text-neutral-400">
          Users: {payload[0].value.toLocaleString()}
        </p>
      </div>
    );
  }
  return null;
};

export function ProfessionBreakdown({ data }: ProfessionBreakdownProps) {
  const excludedCount = data[EXCLUDED_KEY] ?? 0;
  const chartData = Object.entries(data)
    .filter(([name]) => name !== EXCLUDED_KEY)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);

  const visibleTotal = chartData.reduce((s, r) => s + r.value, 0);
  const grandTotal = visibleTotal + excludedCount;
  const excludedPct = grandTotal > 0 ? (excludedCount / grandTotal) * 100 : 0;

  if (chartData.length === 0 && excludedCount === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-3 sm:p-5">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Profession Breakdown</h3>
        <p className="text-gray-600 dark:text-neutral-400 text-center py-6 text-xs">No profession data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-3 sm:p-5">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Profession Breakdown</h3>
        {excludedCount > 0 && (
          <span className="text-[11px] text-gray-500 dark:text-neutral-400">
            Other excluded: <span className="font-semibold text-gray-700 dark:text-neutral-200 tabular-nums">{excludedCount.toLocaleString()}</span>
            {" "}({excludedPct.toFixed(1)}% of all)
          </span>
        )}
      </div>
      <div className="w-full">
        <ResponsiveContainer width="100%" height={380}>
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={100}
              stroke="#6b7280"
              style={{ fontSize: "11px" }}
            />
            <YAxis stroke="#6b7280" style={{ fontSize: "11px" }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: "12px" }} />
            <Bar dataKey="value" fill="#ef4444" name="Users" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
