"use client";

import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { UserMetrics } from "@/types/metrics/UserMetrics";
import { AGE_GROUP_ORDER } from "@/utils/metrics/age-grouping";

const EXCLUDED_KEY = "Unknown" as const;

export interface AgeBreakdownProps {
  data: UserMetrics["ageGroup"];
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value: number;
    color?: string;
    payload?: {
      name?: string;
      users?: number;
      pct?: number;
    };
  }>;
}

const CustomTooltip = ({ active, payload }: TooltipProps) => {
  if (active && payload && payload.length) {
    const point = payload[0]?.payload;
    return (
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-lg dark:shadow-none p-3">
        <p className="font-semibold text-gray-900 dark:text-white">{point?.name}</p>
        <p className="text-sm text-gray-600 dark:text-neutral-400">
          Users: {(point?.users ?? 0).toLocaleString()}
          {typeof point?.pct === "number" ? ` (${point.pct.toFixed(1)}%)` : ""}
        </p>
      </div>
    );
  }
  return null;
};

export function AgeBreakdown({ data }: AgeBreakdownProps) {
  const visibleLabels = AGE_GROUP_ORDER.filter((l) => l !== EXCLUDED_KEY);
  const visibleTotal = visibleLabels.reduce((sum, label) => sum + (data[label] ?? 0), 0);
  const excludedUsers = data[EXCLUDED_KEY] ?? 0;
  const grandTotal = visibleTotal + excludedUsers;
  const excludedPct = grandTotal > 0 ? (excludedUsers / grandTotal) * 100 : 0;

  const chartData = visibleLabels.map((label) => {
    const users = data[label] ?? 0;
    return {
      name: label,
      users,
      pct: visibleTotal > 0 ? (users / visibleTotal) * 100 : 0,
    };
  });

  if (visibleTotal === 0 && excludedUsers === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-3 sm:p-5">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Age Group Breakdown</h3>
        <p className="text-gray-600 dark:text-neutral-400 text-center py-6 text-xs">No age data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-3 sm:p-5">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Age Group Breakdown</h3>
        {excludedUsers > 0 && (
          <span className="text-[11px] text-gray-500 dark:text-neutral-400">
            Unknown excluded: <span className="font-semibold text-gray-700 dark:text-neutral-200 tabular-nums">{excludedUsers.toLocaleString()}</span>
            {" "}({excludedPct.toFixed(1)}% of all)
          </span>
        )}
      </div>
      <div className="w-full">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" stroke="#6b7280" style={{ fontSize: "11px" }} />
            <YAxis stroke="#6b7280" style={{ fontSize: "11px" }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: "12px" }} />
            <Bar dataKey="users" fill="#ef4444" name="Users" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
