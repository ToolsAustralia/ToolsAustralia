"use client";

import React, { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Eye, EyeOff } from "lucide-react";
import { ChartData } from "@/hooks/queries/useAdminQueries";

interface RevenueOverviewProps {
  data: ChartData[];
  isLoading?: boolean;
  error?: Error | null;
}

interface RevenueSummary {
  total: number;
  oneTime: number;
  memberships: number;
  growth: number;
  previousTotal: number;
}

export default function RevenueOverview({ data, isLoading, error }: RevenueOverviewProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<"3M" | "6M" | "12M">("12M");

  // Calculate revenue summary
  const summary: RevenueSummary = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        total: 0,
        oneTime: 0,
        memberships: 0,
        growth: 0,
        previousTotal: 0,
      };
    }

    const currentPeriod = data.slice(-3); // Last 3 months
    const previousPeriod = data.slice(-6, -3); // Previous 3 months

    const currentTotal = currentPeriod.reduce((sum, month) => sum + month.total, 0);
    const previousTotal = previousPeriod.reduce((sum, month) => sum + month.total, 0);
    const growth = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0;

    const oneTime = currentPeriod.reduce((sum, month) => sum + month.oneTime, 0);
    const memberships = currentPeriod.reduce((sum, month) => sum + month.memberships, 0);

    return {
      total: currentTotal,
      oneTime,
      memberships,
      growth,
      previousTotal,
    };
  }, [data]);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Get filtered data based on selected period
  const filteredData = useMemo(() => {
    const periods = {
      "3M": 3,
      "6M": 6,
      "12M": 12,
    };
    return data.slice(-periods[selectedPeriod]);
  }, [data, selectedPeriod]);

  // Calculate max value for chart scaling
  const maxValue = useMemo(() => {
    return Math.max(...filteredData.map((d) => Math.max(d.oneTime, d.memberships, d.total)));
  }, [filteredData]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 sm:p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-32 bg-gray-200 rounded mb-4"></div>
          <div className="flex space-x-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-red-100 p-4 sm:p-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <BarChart3 className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Revenue Data Unavailable</h3>
          <p className="text-sm text-gray-600">Unable to load revenue data at this time.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              Revenue Overview
            </h3>
            <p className="text-sm text-gray-600 mt-1">Monthly revenue breakdown by category</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Period Selector */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              {(["3M", "6M", "12M"] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    selectedPeriod === period ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>

            {/* Toggle Details */}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showDetails ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
          {/* Total Revenue */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-3 sm:p-4 border border-green-100">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-green-600" />
              </div>
              <div
                className={`flex items-center gap-1 text-xs font-medium ${
                  summary.growth >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {summary.growth >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {Math.abs(summary.growth).toFixed(1)}%
              </div>
            </div>
            <div className="text-lg sm:text-xl font-bold text-gray-900">{formatCurrency(summary.total)}</div>
            <div className="text-xs text-gray-600">Total Revenue</div>
          </div>

          {/* One-Time Revenue */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-3 sm:p-4 border border-blue-100">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mb-2">
              <BarChart3 className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-lg sm:text-xl font-bold text-gray-900">{formatCurrency(summary.oneTime)}</div>
            <div className="text-xs text-gray-600">One-Time Packages</div>
          </div>

          {/* Memberships Revenue */}
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-3 sm:p-4 border border-orange-100">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center mb-2">
              <TrendingUp className="w-4 h-4 text-orange-600" />
            </div>
            <div className="text-lg sm:text-xl font-bold text-gray-900">{formatCurrency(summary.memberships)}</div>
            <div className="text-xs text-gray-600">Memberships</div>
          </div>
        </div>

        {/* Chart */}
        <div className="space-y-4">
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span className="text-sm font-medium text-gray-700">One-Time Packages</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
              <span className="text-sm font-medium text-gray-700">Memberships</span>
            </div>
          </div>

          {/* Interactive Chart */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="h-48 sm:h-56 flex items-end justify-between gap-1 sm:gap-2">
              {filteredData.map((month, index) => (
                <div key={index} className="flex-1 flex flex-col items-center group">
                  {/* Chart Bars */}
                  <div className="w-full h-40 sm:h-48 flex flex-col justify-end space-y-1 mb-2">
                    {/* One-Time Packages */}
                    <div
                      className="w-full bg-blue-500 rounded-t-sm transition-all duration-300 hover:bg-blue-600 cursor-pointer relative group"
                      style={{
                        height: `${maxValue > 0 ? (month.oneTime / maxValue) * 100 : 0}%`,
                        minHeight: month.oneTime > 0 ? "4px" : "0px",
                      }}
                    >
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                        One-Time: {formatCurrency(month.oneTime)}
                      </div>
                    </div>

                    {/* Memberships */}
                    <div
                      className="w-full bg-orange-500 rounded-t-sm transition-all duration-300 hover:bg-orange-600 cursor-pointer relative group"
                      style={{
                        height: `${maxValue > 0 ? (month.memberships / maxValue) * 100 : 0}%`,
                        minHeight: month.memberships > 0 ? "4px" : "0px",
                      }}
                    >
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                        Memberships: {formatCurrency(month.memberships)}
                      </div>
                    </div>
                  </div>

                  {/* Month Label */}
                  <div className="text-center">
                    <div className="text-xs font-medium text-gray-700">{month.month}</div>
                    <div className="text-xs text-gray-500 mt-1">{formatCurrency(month.total)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed Breakdown (Collapsible) */}
          {showDetails && (
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <h4 className="text-sm font-semibold text-gray-900">Detailed Breakdown</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {filteredData.slice(-3).map((month, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-3">
                    <div className="text-sm font-medium text-gray-900 mb-2">{month.month}</div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">One-Time:</span>
                        <span className="font-medium">{formatCurrency(month.oneTime)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">Memberships:</span>
                        <span className="font-medium">{formatCurrency(month.memberships)}</span>
                      </div>
                      <div className="flex justify-between text-xs pt-1 border-t border-gray-200">
                        <span className="font-medium text-gray-900">Total:</span>
                        <span className="font-bold text-gray-900">{formatCurrency(month.total)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
