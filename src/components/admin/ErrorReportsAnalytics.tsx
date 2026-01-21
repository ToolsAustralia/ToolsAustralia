"use client";

/**
 * Error Reports Analytics Component
 * 
 * Provides comprehensive analytics and insights for error reports.
 * Features:
 * - Error trends over time
 * - Error distribution by category
 * - Error distribution by severity
 * - Top error messages
 * - Top affected users
 * - Error resolution time metrics
 */

import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { IErrorReport } from "@/types/error-reporting";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

interface ErrorReportsAnalyticsProps {
  reports: IErrorReport[];
}

const COLORS = {
  payment: "#ef4444",
  network: "#3b82f6",
  api: "#f59e0b",
  system: "#8b5cf6",
  recovery: "#10b981",
};

const SEVERITY_COLORS = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#eab308",
};

export default function ErrorReportsAnalytics({ reports }: ErrorReportsAnalyticsProps) {
  // Calculate error trends over time (last 30 days)
  const errorTrends = useMemo(() => {
    const days = 30;
    const trendData: Record<string, number> = {};
    
    // Initialize all days with 0
    for (let i = days - 1; i >= 0; i--) {
      const date = format(subDays(new Date(), i), "yyyy-MM-dd");
      trendData[date] = 0;
    }

    // Count errors per day
    reports.forEach((report) => {
      const date = format(new Date(report.createdAt), "yyyy-MM-dd");
      if (trendData[date] !== undefined) {
        trendData[date]++;
      }
    });

    return Object.entries(trendData).map(([date, count]) => ({
      date: format(new Date(date), "MMM dd"),
      errors: count,
    }));
  }, [reports]);

  // Error distribution by category
  const categoryDistribution = useMemo(() => {
    const distribution: Record<string, number> = {};
    
    reports.forEach((report) => {
      const category = report.category || "unknown";
      distribution[category] = (distribution[category] || 0) + 1;
    });

    return Object.entries(distribution)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [reports]);

  // Error distribution by severity
  const severityDistribution = useMemo(() => {
    const distribution: Record<string, number> = {};
    
    reports.forEach((report) => {
      const severity = report.severity || "unknown";
      distribution[severity] = (distribution[severity] || 0) + 1;
    });

    return Object.entries(distribution)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, unknown: 3 };
        return (order[a.name as keyof typeof order] ?? 999) - (order[b.name as keyof typeof order] ?? 999);
      });
  }, [reports]);

  // Top error messages
  const topErrors = useMemo(() => {
    const errorCounts: Record<string, number> = {};
    
    reports.forEach((report) => {
      const message = report.errorMessage.substring(0, 100); // Truncate for grouping
      errorCounts[message] = (errorCounts[message] || 0) + 1;
    });

    return Object.entries(errorCounts)
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [reports]);

  // Top affected users
  const topUsers = useMemo(() => {
    const userCounts: Record<string, number> = {};
    
    reports.forEach((report) => {
      const userKey = report.isAuthenticated
        ? report.userEmail || report.userId || "unknown"
        : report.guestEmail || report.userEmail || "anonymous";
      
      if (userKey !== "unknown" && userKey !== "anonymous") {
        userCounts[userKey] = (userCounts[userKey] || 0) + 1;
      }
    });

    return Object.entries(userCounts)
      .map(([email, count]) => ({ email, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [reports]);

  // Error resolution time metrics
  const resolutionMetrics = useMemo(() => {
    const resolvedReports = reports.filter(
      (r) => r.status === "resolved" && r.resolvedAt && r.createdAt
    );

    if (resolvedReports.length === 0) {
      return {
        averageHours: 0,
        medianHours: 0,
        minHours: 0,
        maxHours: 0,
        totalResolved: 0,
      };
    }

    const resolutionTimes = resolvedReports.map((report) => {
      const created = new Date(report.createdAt).getTime();
      const resolved = new Date(report.resolvedAt!).getTime();
      return (resolved - created) / (1000 * 60 * 60); // Convert to hours
    });

    resolutionTimes.sort((a, b) => a - b);

    const averageHours =
      resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length;
    const medianHours = resolutionTimes[Math.floor(resolutionTimes.length / 2)];
    const minHours = resolutionTimes[0];
    const maxHours = resolutionTimes[resolutionTimes.length - 1];

    return {
      averageHours: Math.round(averageHours * 10) / 10,
      medianHours: Math.round(medianHours * 10) / 10,
      minHours: Math.round(minHours * 10) / 10,
      maxHours: Math.round(maxHours * 10) / 10,
      totalResolved: resolvedReports.length,
    };
  }, [reports]);

  // Status distribution
  const statusDistribution = useMemo(() => {
    const distribution: Record<string, number> = {};
    
    reports.forEach((report) => {
      distribution[report.status] = (distribution[report.status] || 0) + 1;
    });

    return Object.entries(distribution).map(([name, value]) => ({ name, value }));
  }, [reports]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Error Reports Analytics</h3>
        <p className="text-gray-600">Comprehensive insights into error patterns and trends</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-600">Total Errors</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{reports.length}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-600">Auto-Logged</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">
            {reports.filter((r) => r.autoLogged).length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-600">Critical Errors</div>
          <div className="text-2xl font-bold text-red-600 mt-1">
            {reports.filter((r) => r.severity === "critical").length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-600">Resolved</div>
          <div className="text-2xl font-bold text-green-600 mt-1">
            {reports.filter((r) => r.status === "resolved").length}
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Error Trends Chart */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-4">Error Trends (Last 30 Days)</h4>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={errorTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="errors"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Category Distribution */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-4">Error Distribution by Category</h4>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={categoryDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {categoryDistribution.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[entry.name as keyof typeof COLORS] || "#94a3b8"}
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Severity Distribution */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-4">Error Distribution by Severity</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={severityDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar
                dataKey="value"
                fill="#8884d8"
                radius={[8, 8, 0, 0]}
              >
                {severityDistribution.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={SEVERITY_COLORS[entry.name as keyof typeof SEVERITY_COLORS] || "#94a3b8"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Status Distribution */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-4">Status Distribution</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={statusDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#8884d8" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Errors and Users */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Error Messages */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-4">Top 10 Error Messages</h4>
          <div className="space-y-2">
            {topErrors.length > 0 ? (
              topErrors.map((error, index) => (
                <div key={index} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {error.message}
                    </div>
                  </div>
                  <div className="ml-4 text-sm font-bold text-gray-600">{error.count}</div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm">No errors found</p>
            )}
          </div>
        </div>

        {/* Top Affected Users */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-4">Top 10 Affected Users</h4>
          <div className="space-y-2">
            {topUsers.length > 0 ? (
              topUsers.map((user, index) => (
                <div key={index} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {user.email}
                    </div>
                  </div>
                  <div className="ml-4 text-sm font-bold text-gray-600">{user.count}</div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm">No users found</p>
            )}
          </div>
        </div>
      </div>

      {/* Resolution Metrics */}
      {resolutionMetrics.totalResolved > 0 && (
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-4">Resolution Time Metrics</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <div className="text-sm text-gray-600">Average</div>
              <div className="text-lg font-bold text-gray-900 mt-1">
                {resolutionMetrics.averageHours}h
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Median</div>
              <div className="text-lg font-bold text-gray-900 mt-1">
                {resolutionMetrics.medianHours}h
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Min</div>
              <div className="text-lg font-bold text-gray-900 mt-1">
                {resolutionMetrics.minHours}h
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Max</div>
              <div className="text-lg font-bold text-gray-900 mt-1">
                {resolutionMetrics.maxHours}h
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Total Resolved</div>
              <div className="text-lg font-bold text-green-600 mt-1">
                {resolutionMetrics.totalResolved}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
