"use client";

import React from "react";
import type { MajorDrawComparisonData } from "@/types/metrics/MajorDrawComparison";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";

export interface MajorDrawComparisonChartProps {
  data: MajorDrawComparisonData;
}

const formatCurrency = (value: number) => `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatNumber = (value: number) => value.toLocaleString("en-AU");

export function MajorDrawComparisonChart({ data }: MajorDrawComparisonChartProps) {
  const { currentDrawTotal, previousDrawTotal, currentDrawInfo, previousDrawInfo } = data;

  const chartData = [
    {
      name: "Ad Spend",
      current: currentDrawTotal.adSpend,
      previous: previousDrawTotal.adSpend,
    },
    {
      name: "Revenue",
      current: currentDrawTotal.revenue,
      previous: previousDrawTotal.revenue,
    },
    {
      name: "Profit",
      current: currentDrawTotal.profit,
      previous: previousDrawTotal.profit,
    },
    {
      name: "Sales Count",
      current: currentDrawTotal.salesCount,
      previous: previousDrawTotal.salesCount,
    },
    {
      name: "ROAS",
      current: currentDrawTotal.roas,
      previous: previousDrawTotal.roas,
    },
    {
      name: "Conversions",
      current: currentDrawTotal.conversions,
      previous: previousDrawTotal.conversions,
    },
  ];

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
  }

  const CustomTooltip = ({ active, payload }: TooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
          <p className="font-semibold text-gray-900 mb-2">{payload[0].payload?.name}</p>
          {payload.map((entry, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.dataKey === "ROAS" ? entry.value.toFixed(2) : entry.dataKey.includes("Spend") || entry.dataKey.includes("Revenue") || entry.dataKey.includes("Profit")
                ? formatCurrency(entry.value)
                : formatNumber(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Major Draw Comparison</h3>
        <div className="flex flex-col sm:flex-row gap-4 text-sm text-gray-600">
          <div>
            <span className="font-semibold text-gray-900">Current: </span>
            {currentDrawInfo.name} ({format(new Date(currentDrawInfo.activationDate), "MMM d")} - {format(new Date(currentDrawInfo.drawDate), "MMM d, yyyy")})
          </div>
          <div>
            <span className="font-semibold text-gray-900">Previous: </span>
            {previousDrawInfo.name} ({format(new Date(previousDrawInfo.activationDate), "MMM d")} - {format(new Date(previousDrawInfo.drawDate), "MMM d, yyyy")})
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="name"
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
          <Bar dataKey="current" fill="#10b981" name={currentDrawInfo.name} />
          <Bar dataKey="previous" fill="#6b7280" name={previousDrawInfo.name} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}


