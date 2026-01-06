"use client";

import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { UserMetrics } from "@/types/metrics/UserMetrics";

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
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
        <p className="font-semibold text-gray-900">{payload[0].payload?.name}</p>
        <p className="text-sm text-gray-600">
          Users: {payload[0].value.toLocaleString()}
        </p>
      </div>
    );
  }
  return null;
};

export function ProfessionBreakdown({ data }: ProfessionBreakdownProps) {
  const chartData = Object.entries(data)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10); // Top 10 professions

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Profession Breakdown</h3>
        <p className="text-gray-600 text-center py-8">No profession data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Profession Breakdown</h3>
      <div className="w-full">
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={100}
              stroke="#6b7280"
              style={{ fontSize: "12px" }}
            />
            <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="value" fill="#ef4444" name="Users" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}



