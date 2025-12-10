"use client";

import React, { useState, useMemo } from "react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Calendar,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  MousePointerClick,
  Target,
} from "lucide-react";
import { useFacebookAdsInsights } from "@/hooks/queries/useFacebookAdsInsights";
import type { DateRangeOption, InsightLevel } from "@/types/facebook-ads";

/**
 * Facebook Ads Management Component
 *
 * Displays Facebook ad performance metrics including:
 * - Ad Spend
 * - Revenue (from Facebook Conversions API)
 * - Profit (Revenue - Spend)
 * - ROAS (Return on Ad Spend)
 *
 * Features:
 * - Real-time data fetching with caching
 * - Date range selection (Today / Custom Range)
 * - Granularity levels (Account / Campaign / Ad Set)
 * - Summary cards with key metrics
 * - Data table for breakdown views
 * - Loading states and error handling
 * - Cached data indicators
 */
export default function FacebookAdsManagement() {
  // State management
  const [dateRangeMode, setDateRangeMode] = useState<DateRangeOption>("today");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [level, setLevel] = useState<InsightLevel>("account");
  const [forceRefresh, setForceRefresh] = useState(false);

  // Format dates for input fields (YYYY-MM-DD)
  const today = new Date();
  const defaultStartDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7)
    .toISOString()
    .split("T")[0];
  const defaultEndDate = today.toISOString().split("T")[0];

  // Build query parameters
  const queryParams = useMemo(() => {
    const params: {
      dateRange: DateRangeOption;
      startDate?: string;
      endDate?: string;
      level: InsightLevel;
      refresh?: boolean;
    } = {
      dateRange: dateRangeMode,
      level,
    };

    if (dateRangeMode === "custom") {
      params.startDate = startDate || defaultStartDate;
      params.endDate = endDate || defaultEndDate;
    }

    if (forceRefresh) {
      params.refresh = true;
    }

    return params;
  }, [dateRangeMode, startDate, endDate, level, forceRefresh, defaultStartDate, defaultEndDate]);

  // Fetch insights data
  const { data, isLoading, error, refetch, isFetching } = useFacebookAdsInsights(queryParams);

  // Handle refresh
  const handleRefresh = () => {
    setForceRefresh(true);
    refetch().finally(() => {
      setForceRefresh(false);
    });
  };

  // Format currency (AUD)
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Format percentage
  const formatPercentage = (value: number, decimals: number = 1) => {
    return `${value.toFixed(decimals)}%`;
  };

  // Format number with commas
  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("en-AU").format(value);
  };

  // Format ROAS (e.g., "4.6x")
  const formatROAS = (roas: number) => {
    return `${roas.toFixed(2)}x`;
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Get trend indicator
  const getTrendIcon = (value: number, isPositive: boolean = true) => {
    if (value > 0) {
      return isPositive ? (
        <TrendingUp className="w-4 h-4 text-green-500" />
      ) : (
        <TrendingDown className="w-4 h-4 text-red-500" />
      );
    }
    return null;
  };

  // Summary card component
  const SummaryCard = ({
    title,
    value,
    subtitle,
    icon: Icon,
    trend,
    trendLabel,
    color = "indigo",
  }: {
    title: string;
    value: string;
    subtitle?: string;
    icon: React.ElementType;
    trend?: number;
    trendLabel?: string;
    color?: "indigo" | "emerald" | "yellow" | "purple" | "blue" | "red";
  }) => {
    const colorClasses = {
      indigo: "bg-indigo-50 text-indigo-600",
      emerald: "bg-emerald-50 text-emerald-600",
      yellow: "bg-yellow-50 text-yellow-600",
      purple: "bg-purple-50 text-purple-600",
      blue: "bg-blue-50 text-blue-600",
      red: "bg-red-50 text-red-600",
    };

    return (
      <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-2">
          <div className={`w-10 h-10 ${colorClasses[color]} rounded-lg flex items-center justify-center`}>
            <Icon className="w-5 h-5" />
          </div>
          {trend !== undefined && trend !== 0 && (
            <div className="flex items-center gap-1 text-sm">
              {getTrendIcon(trend, trend > 0)}
              <span className={trend > 0 ? "text-green-600" : "text-red-600"}>{Math.abs(trend).toFixed(1)}%</span>
            </div>
          )}
        </div>
        <h3 className="text-sm font-medium text-gray-600 mb-1">{title}</h3>
        <p className="text-2xl sm:text-3xl font-bold text-gray-900">{value}</p>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        {trendLabel && <p className="text-xs text-gray-400 mt-1">{trendLabel}</p>}
      </div>
    );
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        {/* Summary Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl shadow-lg border-2 border-red-100 p-4 sm:p-6 animate-pulse">
              <div className="h-10 w-10 bg-gray-200 rounded-lg mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-3/4"></div>
            </div>
          ))}
        </div>

        {/* Controls Skeleton */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4 sm:p-6 animate-pulse">
          <div className="h-10 bg-gray-200 rounded w-full"></div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-lg border-2 border-red-200 p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-red-500" />
          <h3 className="text-lg font-semibold text-gray-900">Error Loading Facebook Ads Data</h3>
        </div>
        <p className="text-gray-600 mb-4">{error.message || "An error occurred while fetching data."}</p>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 transition-all duration-200 flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      </div>
    );
  }

  // No data state
  if (!data) {
    return (
      <div className="bg-white rounded-xl shadow-lg border-2 border-gray-200 p-6 sm:p-8 text-center">
        <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Data Available</h3>
        <p className="text-gray-600 mb-4">No Facebook ads data found for the selected date range.</p>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 transition-all duration-200"
        >
          Refresh
        </button>
      </div>
    );
  }

  const { summary, dateRange, syncedAt, cached } = data;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header with Controls */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Facebook Ads Performance</h2>
            <p className="text-sm text-gray-600">
              Track your ad spend, revenue, profit, and ROAS from Facebook Ads Manager
            </p>
          </div>
          <div className="flex items-center gap-2">
            {cached && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="w-3 h-3" />
                <span>Cached</span>
              </div>
            )}
            <button
              onClick={handleRefresh}
              disabled={isFetching}
              className="px-3 py-2 border-2 border-red-600 text-red-600 hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700 hover:text-white rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Date Range Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
            <div className="flex gap-2">
              <button
                onClick={() => setDateRangeMode("today")}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  dateRangeMode === "today"
                    ? "bg-gradient-to-r from-red-600 to-red-700 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setDateRangeMode("custom")}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  dateRangeMode === "custom"
                    ? "bg-gradient-to-r from-red-600 to-red-700 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Custom
              </button>
            </div>
          </div>

          {/* Custom Date Range Inputs */}
          {dateRangeMode === "custom" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                <input
                  type="date"
                  value={startDate || defaultStartDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                <input
                  type="date"
                  value={endDate || defaultEndDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>
            </>
          )}

          {/* Granularity Selector */}
          <div className={dateRangeMode === "custom" ? "sm:col-span-2 lg:col-span-1" : "sm:col-span-2"}>
            <label className="block text-sm font-medium text-gray-700 mb-2">View Level</label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as InsightLevel)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
            >
              <option value="account">Account Level</option>
              <option value="campaign">Campaign Level</option>
              <option value="adset">Ad Set Level</option>
            </select>
          </div>
        </div>

        {/* Date Range Display */}
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
          <Calendar className="w-4 h-4" />
          <span>
            {dateRangeMode === "today"
              ? `Today (${formatDate(dateRange.start)})`
              : `${formatDate(dateRange.start)} - ${formatDate(dateRange.end)}`}
          </span>
          {syncedAt && (
            <>
              <span>•</span>
              <span>Last synced: {new Date(syncedAt).toLocaleTimeString("en-AU")}</span>
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <SummaryCard
          title="Ad Spend"
          value={formatCurrency(summary.spend)}
          subtitle="Total advertising cost"
          icon={DollarSign}
          color="red"
        />
        <SummaryCard
          title="Revenue"
          value={formatCurrency(summary.revenue)}
          subtitle="From Facebook conversions"
          icon={TrendingUp}
          color="emerald"
        />
        <SummaryCard
          title="Profit"
          value={formatCurrency(summary.profit)}
          subtitle={`Revenue - Spend`}
          icon={BarChart3}
          color={summary.profit >= 0 ? "emerald" : "red"}
        />
        <SummaryCard
          title="ROAS"
          value={formatROAS(summary.roas)}
          subtitle="Return on Ad Spend"
          icon={Target}
          color="purple"
        />
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-medium text-gray-600">Impressions</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{formatNumber(summary.impressions)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <MousePointerClick className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-medium text-gray-600">Clicks</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{formatNumber(summary.clicks)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-medium text-gray-600">CTR</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{formatPercentage(summary.ctr)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-medium text-gray-600">CPC</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{formatCurrency(summary.cpc)}</p>
        </div>
      </div>

      {/* Conversions */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Conversions</h3>
          <CheckCircle className="w-5 h-5 text-green-500" />
        </div>
        <div className="text-3xl font-bold text-gray-900">{formatNumber(summary.conversions)}</div>
        <p className="text-sm text-gray-600 mt-1">Total purchases from Facebook ads</p>
      </div>

      {/* Breakdown Table (for Campaign/Ad Set levels) */}
      {data.breakdown && data.breakdown.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {level === "campaign" ? "Campaign Breakdown" : level === "adset" ? "Ad Set Breakdown" : "Breakdown"}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                    {level === "campaign" ? "Campaign" : "Ad Set"}
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Spend</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Revenue</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Profit</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">ROAS</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Conversions</th>
                </tr>
              </thead>
              <tbody>
                {data.breakdown.map((item, index) => (
                  <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 text-sm text-gray-900">
                      {level === "campaign"
                        ? item.campaignName || item.campaignId || "Unknown Campaign"
                        : item.adsetName || item.adsetId || "Unknown Ad Set"}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-gray-900 font-medium">
                      {formatCurrency(item.spend)}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-gray-900 font-medium">
                      {formatCurrency(item.revenue)}
                    </td>
                    <td
                      className={`py-3 px-4 text-sm text-right font-medium ${
                        item.profit >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(item.profit)}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-gray-900 font-medium">{formatROAS(item.roas)}</td>
                    <td className="py-3 px-4 text-sm text-right text-gray-900">{formatNumber(item.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}





