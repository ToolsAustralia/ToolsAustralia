"use client";

import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import type { UserMetrics } from "@/types/metrics/UserMetrics";

export interface MembershipLifecycleChartProps {
  data: UserMetrics["membershipStatus"];
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

export function MembershipLifecycleChart({ data }: MembershipLifecycleChartProps) {
  const chartData = [
    { name: "Active", value: data.active, color: "#10b981" },
    { name: "Cancelled", value: data.cancelled, color: "#ef4444" },
    { name: "Past Due", value: data.pastDue, color: "#f59e0b" },
    { name: "Renewed", value: data.renewed, color: "#3b82f6" },
  ];

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-3 sm:p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Membership Lifecycle</h3>
      <div className="w-full">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" stroke="#6b7280" style={{ fontSize: "12px" }} />
            <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="value" name="Users">
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

