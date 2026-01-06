"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  DollarSign,
  TrendingUp,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Eye,
  MousePointerClick,
  Target,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useFacebookAdsInsights } from "@/hooks/queries/useFacebookAdsInsights";
import type { DateRangeOption, InsightLevel } from "@/types/facebook-ads";
import DateRangeToggle, { DateRange } from "@/components/admin/DateRangeToggle";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import CustomDateRangeModal from "./CustomDateRangeModal";
import { useMajorDrawsForDateRange } from "@/hooks/queries/useAdminQueries";
import { DailyBreakdownChart } from "./DailyBreakdownChart";
import { useDailyMetrics } from "@/hooks/useDailyMetrics";
import { DailyMetricsView } from "./metrics/DailyMetricsView";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // State management - synced with URL params
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);
  const [isDateFilterCollapsed, setIsDateFilterCollapsed] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [level, setLevel] = useState<InsightLevel>("adset");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  // View mode with URL persistence
  const urlViewMode = (searchParams.get("viewMode") as "ads" | "metrics") || "ads";
  const [viewMode, setViewMode] = useState<"ads" | "metrics">(urlViewMode);

  // Sync viewMode with URL params on mount and when URL changes
  // Use a stable value from searchParams to avoid dependency array issues
  const urlViewModeValue = searchParams.get("viewMode") || "ads";
  useEffect(() => {
    setViewMode(urlViewModeValue as "ads" | "metrics");
  }, [urlViewModeValue]);

  // Update URL when viewMode changes
  const handleViewModeChange = (mode: "ads" | "metrics") => {
    setViewMode(mode);
    const params = new URLSearchParams(searchParams.toString());
    params.set("viewMode", mode);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Sync date filter state with URL params on mount and when URL changes
  useEffect(() => {
    const urlDateRange = (searchParams.get("dateRange") as DateRange) || "today";
    let urlStartDate = searchParams.get("startDate") || "";
    let urlEndDate = searchParams.get("endDate") || "";

    // If "all-time" is selected but no dates in URL, calculate and set them
    if (urlDateRange === "all-time" && (!urlStartDate || !urlEndDate)) {
      const today = new Date();
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(today.getFullYear() - 2);
      const calculatedStart = twoYearsAgo.toISOString().split("T")[0];
      const calculatedEnd = today.toISOString().split("T")[0];
      
      // Update URL with calculated dates (only if they're different)
      if (calculatedStart !== urlStartDate || calculatedEnd !== urlEndDate) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("startDate", calculatedStart);
        params.set("endDate", calculatedEnd);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        // Return early - let the next effect run handle the state update
        return;
      }
      
      urlStartDate = calculatedStart;
      urlEndDate = calculatedEnd;
    }

    // Update state from URL params (only if changed to avoid unnecessary re-renders)
    setDateRange((prev) => (prev !== urlDateRange ? urlDateRange : prev));
    setStartDate((prev) => (prev !== urlStartDate ? urlStartDate : prev));
    setEndDate((prev) => (prev !== urlEndDate ? urlEndDate : prev));

    // Auto-collapse on mobile for "all-time" or "custom"
    if (isMobile && (urlDateRange === "all-time" || urlDateRange === "custom")) {
      setIsDateFilterCollapsed(true);
    }
  }, [searchParams, pathname, router, isMobile]);

  // Fetch major draws for date range selection
  const { data: majorDraws = [] } = useMajorDrawsForDateRange();

  // Convert DateRange to DateRangeOption
  // Note: "all-time" is converted to "custom" with 2 years range for API compatibility
  const dateRangeOption: DateRangeOption = useMemo(() => {
    if (dateRange === "all-time") {
      // If we have dates already (from URL), use them
      if (startDate && endDate) {
        return "custom";
      }
      // Otherwise, calculate 2 years range (but don't set state here - let updateDateFilter handle it)
      return "custom";
    }
    return dateRange as DateRangeOption;
  }, [dateRange, startDate, endDate]);

  // Build query parameters
  const queryParams = useMemo(() => {
    const params: {
      dateRange: DateRangeOption;
      startDate?: string;
      endDate?: string;
      level: InsightLevel;
      refresh?: boolean;
    } = {
      dateRange: dateRangeOption,
      level,
    };

    if (dateRangeOption === "custom" && startDate && endDate) {
      params.startDate = startDate;
      params.endDate = endDate;
    }

    return params;
  }, [dateRangeOption, startDate, endDate, level]);

  // Fetch insights data
  const { data, isLoading, error } = useFacebookAdsInsights(queryParams);

  // Format currency (AUD)
  // Note: API returns summary values in dollars, not cents
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

  // Update URL params when date filter changes
  const updateDateFilter = (range: DateRange, start?: string, end?: string) => {
    let finalRange = range;
    let finalStart = start;
    let finalEnd = end;

    // Handle "all-time" by converting to "custom" with 2 years range
    if (range === "all-time") {
      finalRange = "all-time"; // Keep as "all-time" in URL for UI
      const today = new Date();
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(today.getFullYear() - 2);
      finalStart = twoYearsAgo.toISOString().split("T")[0];
      finalEnd = today.toISOString().split("T")[0];
    }

    // Update state immediately for responsive UI
    setDateRange(finalRange);
    if (finalStart && finalEnd) {
      setStartDate(finalStart);
      setEndDate(finalEnd);
    } else {
      setStartDate("");
      setEndDate("");
    }

    // Auto-collapse on mobile for "all-time" or "custom"
    if (isMobile && (finalRange === "all-time" || finalRange === "custom")) {
      setIsDateFilterCollapsed(true);
    }

    // Update URL params
    const params = new URLSearchParams(searchParams.toString());
    params.set("dateRange", finalRange);
    if (finalStart && finalEnd) {
      params.set("startDate", finalStart);
      params.set("endDate", finalEnd);
    } else {
      params.delete("startDate");
      params.delete("endDate");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Handle date range change from DateRangeToggle
  const handleDateRangeChange = (range: DateRange) => {
    if (range === "custom") {
      setIsCustomDateModalOpen(true);
    } else {
      updateDateFilter(range);
    }
  };

  // Determine if filter should be collapsible (only on mobile, and only for custom range or all-time)
  const shouldCollapse = useMemo(() => {
    return isMobile && (dateRange === "custom" || dateRange === "all-time");
  }, [isMobile, dateRange]);

  // Get display date for collapsed view
  const displayDate = useMemo(() => {
    if (dateRange === "custom" && startDate && endDate) {
      try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const format = (date: Date) => {
          const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
        };
        if (startDate === endDate) {
          return format(start);
        }
        const formatShort = (date: Date) => {
          const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          return `${months[date.getMonth()]} ${date.getDate()}`;
        };
        return `${formatShort(start)} - ${format(end)}`;
      } catch {
        return "";
      }
    }
    if (dateRange === "all-time") {
      return "All Time";
    }
    return null;
  }, [dateRange, startDate, endDate]);

  // Table sorting functions
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // New column, default to ascending
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Sort breakdown data
  const sortedBreakdown = useMemo(() => {
    if (!data?.breakdown || !sortColumn) {
      return data?.breakdown || [];
    }

    const sorted = [...data.breakdown];
    sorted.sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      switch (sortColumn) {
        case "name":
          aValue = level === "campaign" ? a.campaignName || a.campaignId || "" : a.adsetName || a.adsetId || "";
          bValue = level === "campaign" ? b.campaignName || b.campaignId || "" : b.adsetName || b.adsetId || "";
          break;
        case "spend":
          aValue = a.spend;
          bValue = b.spend;
          break;
        case "revenue":
          aValue = a.revenue;
          bValue = b.revenue;
          break;
        case "profit":
          aValue = a.profit;
          bValue = b.profit;
          break;
        case "roas":
          aValue = a.roas;
          bValue = b.roas;
          break;
        case "conversions":
          aValue = a.conversions;
          bValue = b.conversions;
          break;
        default:
          return 0;
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortDirection === "asc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }

      const numA = typeof aValue === "number" ? aValue : 0;
      const numB = typeof bValue === "number" ? bValue : 0;
      return sortDirection === "asc" ? numA - numB : numB - numA;
    });

    return sorted;
  }, [data?.breakdown, sortColumn, sortDirection, level]);

  // Get sort icon for column header
  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-3 h-3 ml-1 text-gray-400" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3 h-3 ml-1 text-gray-700" />
    ) : (
      <ArrowDown className="w-3 h-3 ml-1 text-gray-700" />
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
        <p className="text-gray-600">{error.message || "An error occurred while fetching data."}</p>
      </div>
    );
  }

  // No data state
  if (!data) {
    return (
      <div className="bg-white rounded-xl shadow-lg border-2 border-gray-200 p-6 sm:p-8 text-center">
        <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Data Available</h3>
        <p className="text-gray-600">No Facebook ads data found for the selected date range.</p>
      </div>
    );
  }

  const { summary } = data;

  // Component for daily breakdown section
  function DailyBreakdownSection({ startDate, endDate }: { startDate: Date; endDate: Date }) {
    const { data: dailyMetrics, isLoading: dailyLoading } = useDailyMetrics({
      startDate,
      endDate,
      enabled: dateRangeOption === "custom" && !!startDate && !!endDate,
    });

    if (!dailyMetrics || dailyMetrics.length === 0) {
      return null;
    }

    return <DailyBreakdownChart metrics={dailyMetrics} loading={dailyLoading} />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header with Controls - Simple like Dashboard Overview */}
      <div className="flex flex-row items-center justify-between gap-2 sm:gap-4">
        <h2 className="text-sm sm:text-lg lg:text-xl font-bold text-gray-900 flex-1 min-w-0 truncate">
          Facebook Ads Performance
        </h2>
        <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => handleViewModeChange("ads")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === "ads"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Ads
            </button>
            <button
              onClick={() => handleViewModeChange("metrics")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === "metrics"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Metrics
            </button>
          </div>
          {/* Date Range Toggle - Only show for Ads view */}
          {viewMode === "ads" && (
            <DateRangeToggle
              selectedRange={dateRange}
              onRangeChange={handleDateRangeChange}
              onCustomClick={() => setIsCustomDateModalOpen(true)}
              collapsed={isDateFilterCollapsed && shouldCollapse}
              displayDate={displayDate || undefined}
              onExpand={() => setIsDateFilterCollapsed(false)}
            />
          )}
        </div>
      </div>

      {/* Content based on view mode */}
      {viewMode === "metrics" ? (
        <DailyMetricsView />
      ) : (
        <>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title="Ad Spend"
          value={formatCurrency(summary.spend)}
          subtitle="Total advertising cost"
          icon={DollarSign}
          color="red"
        />
        <MetricCard
          title="Revenue"
          value={formatCurrency(summary.revenue)}
          subtitle="From Facebook conversions"
          icon={TrendingUp}
          color="emerald"
        />
        <MetricCard
          title="Profit"
          value={formatCurrency(summary.profit)}
          subtitle="Revenue - Spend"
          icon={BarChart3}
          color={summary.profit >= 0 ? "emerald" : "red"}
        />
        <MetricCard
          title="ROAS"
          value={formatROAS(summary.roas)}
          subtitle="Return on Ad Spend"
          icon={Target}
          color="purple"
        />
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard title="Impressions" value={formatNumber(summary.impressions)} icon={Eye} color="blue" />
        <MetricCard title="Clicks" value={formatNumber(summary.clicks)} icon={MousePointerClick} color="indigo" />
        <MetricCard title="CTR" value={formatPercentage(summary.ctr)} icon={Target} color="yellow" />
        <MetricCard title="CPC" value={formatCurrency(summary.cpc)} icon={DollarSign} color="blue" />
      </div>

      {/* Conversions */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-6">
        <div className="flex items-center justify-between mb-2 sm:mb-4">
          <h3 className="text-sm sm:text-lg font-semibold text-gray-900">Conversions</h3>
          <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
        </div>
        <div className="text-2xl sm:text-3xl font-bold text-gray-900">{formatNumber(summary.conversions)}</div>
        <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1">Total purchases from Facebook ads</p>
      </div>

      {/* Daily Breakdown - Show for custom date ranges */}
      {dateRangeOption === "custom" && startDate && endDate && (
        <DailyBreakdownSection startDate={new Date(startDate)} endDate={new Date(endDate)} />
      )}

      {/* Breakdown Table (for Campaign/Ad Set levels) */}
      {data.breakdown && data.breakdown.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-6">
          <div className="flex flex-row items-center justify-between gap-2 sm:gap-4 mb-3 sm:mb-4">
            <h3 className="text-sm sm:text-lg font-semibold text-gray-900 flex-1 min-w-0 truncate">
              {level === "campaign" ? "Campaign Breakdown" : "Ad Set Breakdown"}
            </h3>

            {/* View Level Dropdown - Compact Styling */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              <label className="text-xs sm:text-sm font-medium text-gray-700 whitespace-nowrap hidden sm:inline">
                View Level:
              </label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as InsightLevel)}
                className="px-2.5 sm:px-3 py-1.5 sm:py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-xs sm:text-sm bg-white font-semibold text-gray-900 shadow-sm hover:border-gray-400 transition-all duration-200 cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpolyline points=%226 9 12 15 18 9%22%3E%3C/polyline%3E%3C/svg%3E')] bg-no-repeat bg-right pr-7 sm:pr-8 min-w-[100px] sm:min-w-[140px]"
                style={{
                  backgroundPosition: "right 0.5rem center",
                  backgroundSize: "0.75em 0.75em",
                }}
              >
                <option value="campaign">Campaign</option>
                <option value="adset">Ad Set</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200 bg-gray-50">
                  <th
                    className="text-left py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center">
                      {level === "campaign" ? "Campaign" : "Ad Set"}
                      {getSortIcon("name")}
                    </div>
                  </th>
                  <th
                    className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort("spend")}
                  >
                    <div className="flex items-center justify-end">
                      Spend
                      {getSortIcon("spend")}
                    </div>
                  </th>
                  <th
                    className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort("revenue")}
                  >
                    <div className="flex items-center justify-end">
                      Revenue
                      {getSortIcon("revenue")}
                    </div>
                  </th>
                  <th
                    className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort("profit")}
                  >
                    <div className="flex items-center justify-end">
                      Profit
                      {getSortIcon("profit")}
                    </div>
                  </th>
                  <th
                    className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort("roas")}
                  >
                    <div className="flex items-center justify-end">
                      ROAS
                      {getSortIcon("roas")}
                    </div>
                  </th>
                  <th
                    className="text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort("conversions")}
                  >
                    <div className="flex items-center justify-end">
                      Conversions
                      {getSortIcon("conversions")}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedBreakdown.map((item, index) => (
                  <tr
                    key={index}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors even:bg-gray-50/30"
                  >
                    <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-gray-900 font-medium">
                      {level === "campaign"
                        ? item.campaignName || item.campaignId || "Unknown Campaign"
                        : item.adsetName || item.adsetId || "Unknown Ad Set"}
                    </td>
                    <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-semibold">
                      {formatCurrency(item.spend)}
                    </td>
                    <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-semibold">
                      {formatCurrency(item.revenue)}
                    </td>
                    <td
                      className={`py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right font-semibold ${
                        item.profit >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(item.profit)}
                    </td>
                    <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-semibold">
                      {formatROAS(item.roas)}
                    </td>
                    <td className="py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-medium">
                      {formatNumber(item.conversions)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Custom Date Range Modal */}
      <CustomDateRangeModal
        isOpen={isCustomDateModalOpen}
        onClose={() => setIsCustomDateModalOpen(false)}
        onApply={(startDateStr, endDateStr) => {
          updateDateFilter("custom", startDateStr, endDateStr);
        }}
        currentStartDate={startDate}
        currentEndDate={endDate}
        majorDraws={majorDraws}
      />
        </>
      )}
    </div>
  );
}
