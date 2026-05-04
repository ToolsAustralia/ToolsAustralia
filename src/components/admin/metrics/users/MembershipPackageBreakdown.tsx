"use client";

import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { UserMetrics } from "@/types/metrics/UserMetrics";

export interface MembershipPackageBreakdownProps {
  data: UserMetrics["membershipByPackage"];
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value: number;
    color?: string;
    payload?: {
      packageName: string;
      total: number;
      active: number;
      pastDue: number;
      cancelled: number;
    };
  }>;
}

const CustomTooltip = ({ active, payload }: TooltipProps) => {
  if (active && payload && payload.length) {
    const point = payload[0]?.payload;
    if (!point) return null;
    return (
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-lg dark:shadow-none p-3">
        <p className="font-semibold text-gray-900 dark:text-white mb-1">{point.packageName}</p>
        <p className="text-sm text-emerald-700 dark:text-emerald-400">Active: {point.active.toLocaleString()}</p>
        <p className="text-sm text-amber-700 dark:text-amber-400">Past Due: {point.pastDue.toLocaleString()}</p>
        <p className="text-sm text-red-700 dark:text-red-400">Cancelled: {point.cancelled.toLocaleString()}</p>
        <p className="text-xs text-gray-600 dark:text-neutral-400 mt-1 pt-1 border-t border-gray-200 dark:border-neutral-700">
          Total: {point.total.toLocaleString()}
        </p>
      </div>
    );
  }
  return null;
};

export function MembershipPackageBreakdown({ data }: MembershipPackageBreakdownProps) {
  const rows = [...data].sort((a, b) => b.total - a.total);

  if (rows.length === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-3 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Membership by Package</h3>
        <p className="text-gray-600 dark:text-neutral-400 text-center py-8">No subscription package data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-3 sm:p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Membership by Package</h3>
      <div className="w-full">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={rows} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="packageName" stroke="#6b7280" style={{ fontSize: "12px" }} />
            <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="active" fill="#10b981" name="Active" stackId="a" />
            <Bar dataKey="pastDue" fill="#f59e0b" name="Past Due" stackId="a" />
            <Bar dataKey="cancelled" fill="#ef4444" name="Cancelled" stackId="a" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
