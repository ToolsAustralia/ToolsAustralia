"use client";

import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { UserMetrics } from "@/types/metrics/UserMetrics";
import { AGE_GROUP_ORDER } from "@/utils/metrics/age-grouping";

export interface AgeBreakdownProps {
  data: UserMetrics["ageGroup"];
  purchasedData?: UserMetrics["ageGroupPurchased"];
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
      purchased?: number;
      pct?: number;
      conversionPct?: number;
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
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          Purchased: {(point?.purchased ?? 0).toLocaleString()}
          {typeof point?.conversionPct === "number" ? ` (${point.conversionPct.toFixed(1)}%)` : ""}
        </p>
      </div>
    );
  }
  return null;
};

export function AgeBreakdown({ data, purchasedData }: AgeBreakdownProps) {
  const total = AGE_GROUP_ORDER.reduce((sum, label) => sum + (data[label] ?? 0), 0);
  const chartData = AGE_GROUP_ORDER.map((label) => {
    const users = data[label] ?? 0;
    const purchased = purchasedData?.[label] ?? 0;
    return {
      name: label,
      users,
      purchased,
      pct: total > 0 ? (users / total) * 100 : 0,
      conversionPct: users > 0 ? (purchased / users) * 100 : 0,
    };
  });

  if (total === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-3 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Age Group Breakdown</h3>
        <p className="text-gray-600 dark:text-neutral-400 text-center py-8">No age data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-3 sm:p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Age Group Breakdown</h3>
      <div className="w-full">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" stroke="#6b7280" style={{ fontSize: "12px" }} />
            <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="users" fill="#ef4444" name="Users" />
            <Bar dataKey="purchased" fill="#10b981" name="Purchased" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
