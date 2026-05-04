"use client";

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ErrorReportsAnalyticsSummary } from "@/types/error-reporting";

interface ErrorReportsAnalyticsProps {
  analytics: ErrorReportsAnalyticsSummary;
}

const CATEGORY_COLORS: Record<string, string> = {
  payment: "#ef4444",
  network: "#3b82f6",
  api: "#f59e0b",
  system: "#8b5cf6",
  recovery: "#10b981",
  missing: "#94a3b8",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#eab308",
  missing: "#94a3b8",
};

function formatLabel(value: string) {
  if (value === "missing") return "Missing";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function SummaryList({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: Array<{ key: string; count: number }>;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-none">
      <h4 className="mb-3 text-sm font-semibold text-gray-800 dark:text-neutral-100">{title}</h4>
      <div className="space-y-2">
        {items.length > 0 ? (
          items.slice(0, 8).map((item) => (
            <div
              key={`${title}-${item.key}`}
              className="flex items-start justify-between gap-3 rounded-lg bg-gray-50 p-3 dark:bg-neutral-800/70"
            >
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-white">
                {item.key}
              </p>
              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 dark:bg-neutral-900 dark:text-neutral-200 dark:ring-neutral-700">
                {item.count}
              </span>
            </div>
          ))
        ) : (
          <p className="text-sm text-gray-500 dark:text-neutral-400">{emptyLabel}</p>
        )}
      </div>
    </div>
  );
}

export default function ErrorReportsAnalytics({ analytics }: ErrorReportsAnalyticsProps) {
  const busiestDay = analytics.trends.reduce(
    (current, next) => (next.errors > current.errors ? next : current),
    analytics.trends[0] || { date: "N/A", errors: 0 }
  );
  const topCategory = analytics.byCategory[0];
  const topSeverity = analytics.bySeverity[0];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Error Reports Analytics</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">
          Filtered analytics across all matching reports, not only the current page.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-none">
          <div className="text-sm text-gray-600 dark:text-neutral-400">Filtered Total</div>
          <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{analytics.total}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-none">
          <div className="text-sm text-gray-600 dark:text-neutral-400">Auto-Logged</div>
          <div className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">{analytics.autoLogged}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-none">
          <div className="text-sm text-gray-600 dark:text-neutral-400">Top Severity</div>
          <div className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">
            {topSeverity ? `${formatLabel(topSeverity.name)} (${topSeverity.value})` : "None"}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-none">
          <div className="text-sm text-gray-600 dark:text-neutral-400">Busiest Day</div>
          <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{busiestDay.errors}</div>
          <div className="text-xs text-gray-500 dark:text-neutral-400">{busiestDay.date}</div>
        </div>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
        Summary: {topCategory ? `${formatLabel(topCategory.name)} is the most common category with ${topCategory.value} reports. ` : ""}
        {topSeverity ? `${formatLabel(topSeverity.name)} is the leading severity. ` : ""}
        Average resolution time is {analytics.resolutionMetrics.averageHours}h across{" "}
        {analytics.resolutionMetrics.totalResolved} resolved reports.
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-none">
          <h4 className="mb-4 text-sm font-semibold text-gray-800 dark:text-neutral-100">Error Trends (Last 30 Days)</h4>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={analytics.trends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="errors" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-none">
          <h4 className="mb-4 text-sm font-semibold text-gray-800 dark:text-neutral-100">Severity Distribution</h4>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={analytics.bySeverity.map((item) => ({ ...item, label: formatLabel(item.name) }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {analytics.bySeverity.map((entry) => (
                  <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] || "#94a3b8"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-none">
          <h4 className="mb-4 text-sm font-semibold text-gray-800 dark:text-neutral-100">Category Distribution</h4>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={analytics.byCategory.map((item) => ({ ...item, label: formatLabel(item.name) }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {analytics.byCategory.map((entry) => (
                  <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || "#94a3b8"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-none">
          <h4 className="mb-4 text-sm font-semibold text-gray-800 dark:text-neutral-100">Resolution Time</h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["Average", `${analytics.resolutionMetrics.averageHours}h`],
              ["Median", `${analytics.resolutionMetrics.medianHours}h`],
              ["Min", `${analytics.resolutionMetrics.minHours}h`],
              ["Max", `${analytics.resolutionMetrics.maxHours}h`],
              ["Resolved", analytics.resolutionMetrics.totalResolved],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-gray-50 p-3 dark:bg-neutral-800/70">
                <div className="text-xs text-gray-500 dark:text-neutral-400">{label}</div>
                <div className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SummaryList title="Top Errors" items={analytics.topErrors} emptyLabel="No errors found" />
        <SummaryList title="Top Endpoints" items={analytics.topEndpoints} emptyLabel="No endpoints found" />
        <SummaryList title="Top Affected Users" items={analytics.topUsers} emptyLabel="No affected users found" />
      </div>
    </div>
  );
}
