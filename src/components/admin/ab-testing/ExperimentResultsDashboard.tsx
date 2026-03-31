"use client";

import React, { useState } from "react";
import { BarChart3, Target, Award, AlertCircle, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface ExperimentResultsDashboardProps {
  experimentId: string;
}

interface StatisticalResults {
  significant?: boolean;
  pValue?: number | null;
  confidence?: number | null;
  lift?: number | null;
  controlRate?: number;
  variantRate?: number;
  controlInterval?: { lower: number; upper: number } | null;
  variantInterval?: { lower: number; upper: number } | null;
  chiSquare?: number;
}

interface VariantMetrics {
  variantId: string;
  variantName?: string; // ✅ Variant name for display
  metrics: {
    pageViews: number;
    uniqueVisitors: number;
    clicks: number;
    conversions: number;
    revenue: number;
    conversionRate: number;
    ctr: number;
    revenuePerUser: number;
  };
}

interface ExperimentResults {
  comparison: {
    variants: VariantMetrics[];
    totalPageViews: number;
    totalConversions: number;
    totalRevenue: number;
  };
  significance: StatisticalResults;
  winner: {
    winner: "control" | "variant" | "inconclusive";
    reason: string;
    significance: StatisticalResults;
  };
}

/**
 * Experiment Results Dashboard
 * Displays comprehensive statistical analysis and metrics for A/B testing experiments
 */
export default function ExperimentResultsDashboard({ experimentId }: ExperimentResultsDashboardProps) {
  const [dateRange, _setDateRange] = useState<{ start?: Date; end?: Date }>({});

  // Fetch analytics data
  const { data: analyticsData, isLoading } = useQuery<ExperimentResults>({
    queryKey: [`experiment-analytics-${experimentId}`, dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange.start) params.append("startDate", dateRange.start.toISOString());
      if (dateRange.end) params.append("endDate", dateRange.end.toISOString());

      const response = await fetch(`/api/admin/ab-testing/experiments/${experimentId}/analytics?${params}`);
      if (!response.ok) throw new Error("Failed to fetch analytics");
      const result = await response.json();
      return result.data; // Extract data from response
    },
    enabled: !!experimentId,
  });

  // Fetch winner determination
  const { data: winnerData } = useQuery({
    queryKey: [`experiment-winner-${experimentId}`],
    queryFn: async () => {
      const response = await fetch(`/api/admin/ab-testing/experiments/${experimentId}/winner`);
      if (!response.ok) throw new Error("Failed to fetch winner");
      return response.json();
    },
    enabled: !!experimentId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="text-center p-8 text-gray-500">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p>No analytics data available</p>
      </div>
    );
  }

  const { comparison, significance, winner: winnerFromAnalytics } = analyticsData || {};
  const winner = winnerFromAnalytics || winnerData?.data;

  // Prepare chart data
  // ✅ FIX: Use variant names instead of "Variant 1", "Variant 2"
  const conversionRateData = comparison.variants.map((v, index) => ({
    name: v.variantName || `Variant ${index + 1}`,
    "Conversion Rate": v.metrics.conversionRate,
    "CTR": v.metrics.ctr,
  }));

  const revenueData = comparison.variants.map((v, index) => ({
    name: v.variantName || `Variant ${index + 1}`,
    Revenue: v.metrics.revenue,
    "Revenue per User": v.metrics.revenuePerUser,
  }));

  const trafficDistribution = comparison.variants.map((v, index) => ({
    name: v.variantName || `Variant ${index + 1}`,
    value: v.metrics.uniqueVisitors,
  }));

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

  return (
    <div className="space-y-6">
      {/* Statistical Significance Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Statistical Significance
          </h3>
          {significance.significant != null ? (
            significance.significant ? (
              <span className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">Significant</span>
              </span>
            ) : (
              <span className="flex items-center gap-2 text-yellow-600">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">Not Significant</span>
              </span>
            )
          ) : (
            <span className="flex items-center gap-2 text-gray-500">
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">Calculating...</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-neutral-400 mb-1">P-Value</p>
            <p className="text-2xl font-bold text-gray-900">
              {significance.pValue != null ? significance.pValue.toFixed(4) : "N/A"}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {significance.pValue != null
                ? significance.pValue < 0.05
                  ? "Statistically significant"
                  : "Not significant"
                : "Calculating..."}
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-neutral-400 mb-1">Confidence Level</p>
            <p className="text-2xl font-bold text-gray-900">
              {significance.confidence != null ? `${significance.confidence.toFixed(2)}%` : "N/A"}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {significance.confidence != null
                ? significance.confidence >= 95
                  ? "High confidence"
                  : "Low confidence"
                : "Calculating..."}
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-neutral-400 mb-1">Lift</p>
            <p className={`text-2xl font-bold ${significance.lift != null && significance.lift > 0 ? "text-green-600" : "text-red-600"}`}>
              {significance.lift != null
                ? `${significance.lift > 0 ? "+" : ""}${significance.lift.toFixed(2)}%`
                : "N/A"}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {significance.lift != null
                ? significance.lift > 0
                  ? "Improvement"
                  : "Decline"
                : "Calculating..."}{" "}
              vs control
            </p>
          </div>
        </div>

        {/* Confidence Intervals */}
        {significance.controlInterval && significance.variantInterval && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm font-medium text-gray-700 dark:text-neutral-200 mb-2">Confidence Intervals (95%)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Control Variant</p>
                <p className="text-sm text-gray-900">
                  {significance.controlInterval.lower.toFixed(2)}% - {significance.controlInterval.upper.toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Test Variant</p>
                <p className="text-sm text-gray-900">
                  {significance.variantInterval.lower.toFixed(2)}% - {significance.variantInterval.upper.toFixed(2)}%
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Winner Declaration */}
      {winner && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Award className="w-5 h-5 text-yellow-600" />
              Winner Determination
            </h3>
            {winner.winner !== "inconclusive" && (
              <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                {winner.winner === "variant" ? "Test Variant Wins" : "Control Wins"}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 dark:text-neutral-400">{winner.reason}</p>
        </div>
      )}

      {/* Metrics Comparison */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-blue-600" />
          Variant Comparison
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {comparison.variants.map((variant, index) => (
            <div key={variant.variantId} className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700 dark:text-neutral-200 mb-3">{variant.variantName || `Variant ${index + 1}`}</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-neutral-400">Visitors:</span>
                  <span className="font-medium">{variant.metrics.uniqueVisitors.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-neutral-400">Conversions:</span>
                  <span className="font-medium">{variant.metrics.conversions.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-neutral-400">Conversion Rate:</span>
                  <span className="font-medium">{variant.metrics.conversionRate.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-neutral-400">Revenue:</span>
                  <span className="font-medium">${variant.metrics.revenue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-neutral-400">Revenue/User:</span>
                  <span className="font-medium">${variant.metrics.revenuePerUser.toFixed(2)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Conversion Rate Chart */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-neutral-200 mb-3">Conversion Rate & CTR</h4>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={conversionRateData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="Conversion Rate" fill="#3b82f6" />
                <Bar dataKey="CTR" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Revenue Chart */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-neutral-200 mb-3">Revenue Metrics</h4>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} />
                <Legend />
                <Bar dataKey="Revenue" fill="#f59e0b" />
                <Bar dataKey="Revenue per User" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Traffic Distribution */}
        <div className="mt-6">
          <h4 className="text-sm font-medium text-gray-700 dark:text-neutral-200 mb-3">Traffic Distribution</h4>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={trafficDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {trafficDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

