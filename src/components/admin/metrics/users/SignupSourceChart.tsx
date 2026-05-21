"use client";

import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import type { UserMetrics } from "@/types/metrics/UserMetrics";

export interface SignupSourceChartProps {
  data: UserMetrics["signupSource"];
}

const COLORS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"];

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
  }>;
}

const CustomTooltip = ({ active, payload }: TooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-lg dark:shadow-none p-3">
        <p className="font-semibold text-gray-900 dark:text-white">{payload[0].name}</p>
        <p className="text-sm text-gray-600 dark:text-neutral-400">
          Users: {payload[0].value.toLocaleString()}
        </p>
      </div>
    );
  }
  return null;
};

export function SignupSourceChart({ data }: SignupSourceChartProps) {
  const chartData = [
    { name: "Affiliate", value: data.affiliate },
    { name: "Referral", value: data.referral },
    { name: "Direct", value: data.direct },
    { name: "Organic", value: data.organic },
    { name: "Social", value: data.social },
  ].filter((item) => item.value > 0);

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-3 sm:p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Signup Sources</h3>
      <div className="w-full">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 text-center text-sm text-gray-600 dark:text-neutral-400">
        Total Users: {total.toLocaleString()}
      </div>
    </div>
  );
}



