"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useMonthlyComparison } from "@/hooks/useMonthlyComparison";
import { useViewMode } from "@/hooks/useViewMode";
import { useDailyMetrics } from "@/hooks/useDailyMetrics";
import { MonthlyComparison } from "./MonthlyComparison/MonthlyComparison";
import { MajorDrawComparison } from "./MajorDrawComparison/MajorDrawComparison";
import { ComparisonModeToggle, ComparisonMode } from "./shared/ComparisonModeToggle";
import { MajorDrawSelector } from "./shared/MajorDrawSelector";
import { useMajorDrawComparison } from "@/hooks/useMajorDrawComparison";
import { DailyMetricsTable } from "./DailyMetricsTable/DailyMetricsTable";
import { ViewSwitcher } from "./shared/ViewSwitcher";
import { MetricsDateFilter, MetricsDateFilterMode } from "./shared/MetricsDateFilter";
import { getWebsiteLaunchDateUTC } from "@/utils/common/timezone";
import { MetricsErrorBoundary } from "./ErrorBoundary";
import { DailyMetricsChart } from "./charts/DailyMetricsChart";
import { DailyMetricsBreakdownView } from "./DailyMetricsBreakdownView";
import { RevenueBreakdown } from "./RevenueBreakdown";
import CustomDateRangeModal from "@/components/admin/CustomDateRangeModal";
import { format, startOfDay, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { Skeleton } from "@/components/ui/skeleton";
import type { MonthlyComparisonData } from "@/types/metrics/MonthlyComparison";
import type { IDailyMetrics } from "@/types/metrics/DailyMetrics";
import { useMajorDrawsForDateRange } from "@/hooks/queries/useAdminQueries";
import type { BreakdownItem } from "./DailyMetricsBreakdownTable";
import { ChevronLeft } from "lucide-react";

export interface DailyMetricsViewProps {
  initialMonth?: string; // YYYY-MM format
}

type BreakdownLevel = "account" | "campaign" | "adset" | "ad";

export function DailyMetricsView({ initialMonth }: DailyMetricsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Get current month if not provided
  const currentMonth = useMemo(() => {
    if (initialMonth) {
      return initialMonth;
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, [initialMonth]);

  // State management - synced with URL params
  const [filterMode, setFilterMode] = useState<MetricsDateFilterMode>(
    (searchParams.get("filterMode") as MetricsDateFilterMode) || "month"
  );
  const [selectedMonth, setSelectedMonth] = useState(
    searchParams.get("month") || currentMonth
  );
  const [startDate, setStartDate] = useState<string>(searchParams.get("startDate") || "");
  const [endDate, setEndDate] = useState<string>(searchParams.get("endDate") || "");
  const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);
  const [chartType, setChartType] = useState<"line" | "area" | "bar">("line");
  
  // Breakdown level and selection state
  const [breakdownLevel, setBreakdownLevel] = useState<BreakdownLevel>(
    (searchParams.get("breakdownLevel") as BreakdownLevel) || "account"
  );
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | undefined>(
    searchParams.get("selectedCampaignId") || undefined
  );
  const [selectedAdsetId, setSelectedAdsetId] = useState<string | undefined>(
    searchParams.get("selectedAdsetId") || undefined
  );
  const [selectedAdId, setSelectedAdId] = useState<string | undefined>(
    searchParams.get("selectedAdId") || undefined
  );
  
  // Comparison mode state (month vs major-draw)
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>(
    (searchParams.get("comparisonMode") as ComparisonMode) || "month"
  );
  const [currentDrawId, setCurrentDrawId] = useState<string | null>(
    searchParams.get("currentDrawId") || null
  );
  const [previousDrawId, setPreviousDrawId] = useState<string | null>(
    searchParams.get("previousDrawId") || null
  );
  
  // View mode with URL persistence - default to "chart" when metrics view is first opened
  const urlDailyMetricsViewMode = searchParams.get("dailyMetricsViewMode") as "table" | "chart" | "side-by-side" | null;
  const { viewMode, changeViewMode } = useViewMode(urlDailyMetricsViewMode || "chart");

  // Initialize dailyMetricsViewMode in URL if not present (default to chart) and sync with URL
  useEffect(() => {
    const currentUrlDailyMetricsViewMode = searchParams.get("dailyMetricsViewMode") as "table" | "chart" | "side-by-side" | null;
    
    if (!currentUrlDailyMetricsViewMode) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("dailyMetricsViewMode", "chart");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [searchParams, pathname, router]);

  // Sync viewMode to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (viewMode !== urlDailyMetricsViewMode) {
      params.set("dailyMetricsViewMode", viewMode);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [viewMode, urlDailyMetricsViewMode, searchParams, pathname, router]);

  // Sync breakdown state from URL
  useEffect(() => {
    const urlBreakdownLevel = (searchParams.get("breakdownLevel") as BreakdownLevel) || "account";
    const urlCampaignId = searchParams.get("selectedCampaignId") || undefined;
    const urlAdsetId = searchParams.get("selectedAdsetId") || undefined;
    const urlAdId = searchParams.get("selectedAdId") || undefined;

    setBreakdownLevel(urlBreakdownLevel);
    setSelectedCampaignId(urlCampaignId);
    setSelectedAdsetId(urlAdsetId);
    setSelectedAdId(urlAdId);
  }, [searchParams]);

  // Update URL when breakdown state changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("breakdownLevel", breakdownLevel);
    if (selectedCampaignId) {
      params.set("selectedCampaignId", selectedCampaignId);
    } else {
      params.delete("selectedCampaignId");
    }
    if (selectedAdsetId) {
      params.set("selectedAdsetId", selectedAdsetId);
    } else {
      params.delete("selectedAdsetId");
    }
    if (selectedAdId) {
      params.set("selectedAdId", selectedAdId);
    } else {
      params.delete("selectedAdId");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [breakdownLevel, selectedCampaignId, selectedAdsetId, selectedAdId, router, pathname, searchParams]);

  // Fetch major draws for custom date modal
  const { data: majorDraws = [] } = useMajorDrawsForDateRange();

  // Convert dates for API calls
  const startDateObj = useMemo(() => {
    if (filterMode === "all-time") {
      // Website launch date: November 27, 2025 at 8pm AEDT/AEST
      return getWebsiteLaunchDateUTC();
    }
    if (filterMode === "custom" && startDate) {
      return startOfDay(parseISO(startDate));
    }
    if (filterMode === "month") {
      const [year, month] = selectedMonth.split("-").map(Number);
      return startOfMonth(new Date(year, month - 1, 1));
    }
    return null;
  }, [filterMode, startDate, selectedMonth]);

  const endDateObj = useMemo(() => {
    if (filterMode === "all-time") {
      // Current date/time
      return new Date();
    }
    if (filterMode === "custom" && endDate) {
      return startOfDay(parseISO(endDate));
    }
    if (filterMode === "month") {
      const [year, month] = selectedMonth.split("-").map(Number);
      return endOfMonth(new Date(year, month - 1, 1));
    }
    return null;
  }, [filterMode, endDate, selectedMonth]);

  // Determine breakdownId based on level
  const breakdownId = useMemo(() => {
    if (breakdownLevel === "campaign" && selectedCampaignId) {
      return selectedCampaignId;
    } else if (breakdownLevel === "adset" && selectedAdsetId) {
      return selectedAdsetId;
    } else if (breakdownLevel === "ad" && selectedAdId) {
      return selectedAdId;
    }
    return undefined;
  }, [breakdownLevel, selectedCampaignId, selectedAdsetId, selectedAdId]);

  // Fetch data based on filter mode
  const { data: dailyMetricsData, isLoading: dailyLoading } = useDailyMetrics({
    startDate: startDateObj || new Date(),
    endDate: endDateObj || new Date(),
    level: breakdownLevel,
    breakdownId,
    enabled: (filterMode === "custom" || filterMode === "all-time") && !!startDateObj && !!endDateObj,
  });

  const { data: monthlyData, isLoading: monthlyLoading, error } = useMonthlyComparison({
    month: selectedMonth,
    enabled: filterMode === "month" && comparisonMode === "month",
  });

  const { data: majorDrawComparisonData, isLoading: majorDrawLoading, error: majorDrawError } = useMajorDrawComparison({
    currentDrawId: currentDrawId || "",
    previousDrawId: previousDrawId || "",
    enabled: filterMode === "month" && comparisonMode === "major-draw" && !!currentDrawId && !!previousDrawId,
  });

  // Determine which data to use
  const isLoading = filterMode === "custom" 
    ? dailyLoading 
    : comparisonMode === "major-draw" 
    ? majorDrawLoading 
    : monthlyLoading;
  
  const comparisonError = comparisonMode === "major-draw" ? majorDrawError : error;
  const data = useMemo(
    () =>
      filterMode === "custom"
        ? dailyMetricsData
          ? {
              currentMonth: dailyMetricsData,
              previousMonth: [],
            }
          : null
        : monthlyData,
    [filterMode, dailyMetricsData, monthlyData]
  );
  
  // Check if data has the MonthlyComparisonData structure
  const isMonthlyComparisonData = data && typeof data === 'object' && 'currentMonthTotal' in data && 'previousMonthTotal' in data && 'comparison' in data;
  
  // Check if we have major draw comparison data
  const hasMajorDrawComparison = majorDrawComparisonData && comparisonMode === "major-draw";

  // Generate month options (last 12 months)
  const monthOptions = useMemo(() => {
    const options: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push(format(date, "yyyy-MM"));
    }
    return options;
  }, []);

  // Format month for display
  const formatMonthDisplay = (month: string) => {
    const [year, monthNum] = month.split("-");
    const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    return format(date, "MMMM yyyy");
  };

  // Combine metrics for display
  const allMetrics = useMemo(() => {
    if (!data) return [];
    
    let metrics: IDailyMetrics[] = [];
    
    if (filterMode === "custom" || filterMode === "all-time") {
      metrics = data.currentMonth || [];
    } else if (filterMode === "month") {
      // When month mode is selected, only show current month data (not previous month for comparison)
      metrics = data.currentMonth || [];
      
      // Filter to ensure only dates from the selected month are shown
      if (selectedMonth) {
        const [year, month] = selectedMonth.split("-").map(Number);
        const _monthStart = startOfMonth(new Date(year, month - 1, 1));
        const _monthEnd = endOfMonth(new Date(year, month - 1, 1));
        
        metrics = metrics.filter((metric) => {
          const metricDate = new Date(metric.date);
          // Compare dates in AEST timezone
          const metricYear = parseInt(formatInTimeZone(metricDate, "Australia/Sydney", "yyyy"), 10);
          const metricMonth = parseInt(formatInTimeZone(metricDate, "Australia/Sydney", "M"), 10);
          return metricYear === year && metricMonth === month;
        });
      }
    }
    
    // Deduplicate by date to avoid any duplicates
    const uniqueMetrics = new Map<string, IDailyMetrics>();
    for (const metric of metrics) {
      const dateKey = new Date(metric.date).toISOString();
      if (!uniqueMetrics.has(dateKey)) {
        uniqueMetrics.set(dateKey, metric);
      }
    }
    
    return Array.from(uniqueMetrics.values());
  }, [data, filterMode, selectedMonth]);

  // Update URL params when filter changes
  const updateURLParams = (updates: {
    filterMode?: MetricsDateFilterMode;
    month?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (updates.filterMode !== undefined) {
      params.set("filterMode", updates.filterMode);
    }
    if (updates.month !== undefined) {
      params.set("month", updates.month);
    }
    if (updates.startDate !== undefined) {
      if (updates.startDate) {
        params.set("startDate", updates.startDate);
      } else {
        params.delete("startDate");
      }
    }
    if (updates.endDate !== undefined) {
      if (updates.endDate) {
        params.set("endDate", updates.endDate);
      } else {
        params.delete("endDate");
      }
    }
    
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Handle filter mode change
  const handleFilterModeChange = (mode: MetricsDateFilterMode) => {
    setFilterMode(mode);
    updateURLParams({ filterMode: mode });
    
    if (mode === "month") {
      setStartDate("");
      setEndDate("");
      updateURLParams({ startDate: "", endDate: "" });
    } else if (mode === "all-time") {
      // Set all-time dates: from website launch to now
      const launchDateUTC = getWebsiteLaunchDateUTC();
      const now = new Date();
      const launchDateStr = format(launchDateUTC, "yyyy-MM-dd");
      const nowDateStr = format(now, "yyyy-MM-dd");
      setStartDate(launchDateStr);
      setEndDate(nowDateStr);
      updateURLParams({ startDate: launchDateStr, endDate: nowDateStr });
    }
  };

  // Handle month selection
  const handleMonthSelect = (month: string) => {
    setSelectedMonth(month);
    updateURLParams({ month, filterMode: "month" });
    setFilterMode("month");
  };

  // Handle custom date apply
  const handleCustomDateApply = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    setFilterMode("custom");
    updateURLParams({ startDate: start, endDate: end, filterMode: "custom" });
  };

  // Handle view mode change with URL update
  const handleViewModeChange = (mode: "table" | "chart" | "side-by-side") => {
    changeViewMode(mode);
    const params = new URLSearchParams(searchParams.toString());
    params.set("dailyMetricsViewMode", mode);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Handle breakdown level change
  const handleBreakdownLevelChange = (level: BreakdownLevel) => {
    setBreakdownLevel(level);
    // Reset selections when changing level
    if (level === "account") {
      setSelectedCampaignId(undefined);
      setSelectedAdsetId(undefined);
      setSelectedAdId(undefined);
    } else if (level === "campaign") {
      setSelectedAdsetId(undefined);
      setSelectedAdId(undefined);
    } else if (level === "adset") {
      setSelectedAdId(undefined);
    }
  };

  // Handle breakdown item selection
  const handleBreakdownItemSelect = (item: BreakdownItem, level: "campaign" | "adset" | "ad") => {
    if (level === "campaign") {
      setSelectedCampaignId(item.id);
      setBreakdownLevel("adset");
      setSelectedAdsetId(undefined);
      setSelectedAdId(undefined);
    } else if (level === "adset") {
      setSelectedAdsetId(item.id);
      setBreakdownLevel("ad");
      setSelectedAdId(undefined);
    } else if (level === "ad") {
      setSelectedAdId(item.id);
    }
  };

  // Handle back navigation in breakdown
  const handleBreakdownBack = () => {
    if (breakdownLevel === "ad" && selectedAdsetId) {
      setBreakdownLevel("adset");
      setSelectedAdId(undefined);
    } else if (breakdownLevel === "adset" && selectedCampaignId) {
      setBreakdownLevel("campaign");
      setSelectedAdsetId(undefined);
    } else if (breakdownLevel === "campaign") {
      setBreakdownLevel("account");
      setSelectedCampaignId(undefined);
    }
  };

  // Show breakdown view when level is not account
  const showBreakdownView = breakdownLevel !== "account" && (filterMode === "custom" || filterMode === "all-time") && !!startDateObj && !!endDateObj;
  
  // Show main metrics view when account level or in month mode
  const showMainMetricsView = breakdownLevel === "account" || filterMode === "month" || !showBreakdownView;

  // Handle comparison mode change
  const handleComparisonModeChange = (mode: ComparisonMode) => {
    setComparisonMode(mode);
    const params = new URLSearchParams(searchParams.toString());
    params.set("comparisonMode", mode);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Handle major draw selection
  const handleCurrentDrawChange = (drawId: string) => {
    setCurrentDrawId(drawId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("currentDrawId", drawId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handlePreviousDrawChange = (drawId: string) => {
    setPreviousDrawId(drawId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("previousDrawId", drawId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (comparisonError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <p className="text-red-700">Error loading metrics: {comparisonError instanceof Error ? comparisonError.message : "Unknown error"}</p>
      </div>
    );
  }

  return (
    <MetricsErrorBoundary>
      <div className="space-y-4 sm:space-y-6">
      {/* Header with Controls */}
        <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">Daily Metrics</h2>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
              {/* Date Filter Toggle */}
              <MetricsDateFilter
                filterMode={filterMode}
                onFilterModeChange={handleFilterModeChange}
                onCustomClick={() => setIsCustomDateModalOpen(true)}
                displayDate={
                  filterMode === "all-time"
                    ? "All Time"
                    : filterMode === "custom" && startDate && endDate
                    ? `${format(parseISO(startDate), "MMM d")} - ${format(parseISO(endDate), "MMM d, yyyy")}`
                    : undefined
                }
              />

          {/* Month Selector */}
            {filterMode === "month" && (
              <>
          <div className="flex items-center gap-2 flex-1 sm:flex-none">
            <label htmlFor="month-select" className="text-sm font-medium text-gray-700 whitespace-nowrap hidden sm:inline">
              Month:
            </label>
            <select
              id="month-select"
              value={selectedMonth}
                    onChange={(e) => handleMonthSelect(e.target.value)}
                    className="px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm bg-white font-semibold text-gray-900 flex-1 sm:flex-none min-w-[140px]"
            >
              {monthOptions.map((month) => (
                <option key={month} value={month}>
                  {formatMonthDisplay(month)}
                </option>
              ))}
            </select>
          </div>
                {/* Comparison Mode Toggle */}
                <ComparisonModeToggle mode={comparisonMode} onModeChange={handleComparisonModeChange} />
              </>
            )}

          {/* View Switcher */}
          <div className="flex-shrink-0">
                <ViewSwitcher currentView={viewMode} onViewChange={handleViewModeChange} />
          </div>
        </div>
      </div>

          {/* Breakdown Level Selector - Only show in custom or all-time date mode */}
          {(filterMode === "custom" || filterMode === "all-time") && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">View:</label>
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                {(["account", "campaign", "adset", "ad"] as BreakdownLevel[]).map((level) => (
                  <button
                    key={level}
                    onClick={() => handleBreakdownLevelChange(level)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                      breakdownLevel === level
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
              {showBreakdownView && (
                <button
                  onClick={handleBreakdownBack}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              )}
            </div>
          )}
        </div>

        {/* Custom Date Range Modal */}
        <CustomDateRangeModal
          isOpen={isCustomDateModalOpen}
          onClose={() => setIsCustomDateModalOpen(false)}
          onApply={handleCustomDateApply}
          currentStartDate={startDate}
          currentEndDate={endDate}
          majorDraws={majorDraws}
        />

      {/* Content */}
      {isLoading ? (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
            <div className="space-y-4">
              <Skeleton className="h-6 w-1/4" />
              <Skeleton className="h-10 w-full" />
            {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
      ) : data ? (
          <>
            {/* Breakdown View - Show when level is campaign/adset/ad */}
            {showBreakdownView && startDateObj && endDateObj && (
              <DailyMetricsBreakdownView
                startDate={startDateObj}
                endDate={endDateObj}
                level={breakdownLevel as "campaign" | "adset" | "ad"}
                onItemSelect={handleBreakdownItemSelect}
                selectedCampaignId={selectedCampaignId}
                selectedAdsetId={selectedAdsetId}
              />
            )}

            {/* Main Metrics View - Show when account level or in month mode */}
            {showMainMetricsView && (
        <>
          {viewMode === "table" && (
                  <DailyMetricsTable metrics={allMetrics} />
                )}
                {viewMode === "chart" && (
                  <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                      <h3 className="text-lg font-semibold text-gray-900">Daily Metrics Chart</h3>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setChartType("line")}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            chartType === "line"
                              ? "bg-red-500 text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          Line
                        </button>
                        <button
                          onClick={() => setChartType("area")}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            chartType === "area"
                              ? "bg-red-500 text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          Area
                        </button>
                        <button
                          onClick={() => setChartType("bar")}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            chartType === "bar"
                              ? "bg-red-500 text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          Bar
                        </button>
                      </div>
                    </div>
                    {allMetrics && allMetrics.length > 0 ? (
                      <DailyMetricsChart
                        metrics={allMetrics}
                        type={chartType}
                        metricsToShow={["revenue", "adSpend", "profit"]}
                        height={400}
                        breakdownLevel={breakdownLevel}
                        breakdownId={breakdownId}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-[400px] text-gray-500">
                        <p>No data available for the selected period</p>
                      </div>
                    )}
                  </div>
          )}
                {viewMode === "side-by-side" && (
                  filterMode === "month" ? (
                    <>
                      {comparisonMode === "month" && isMonthlyComparisonData ? (
                        <MonthlyComparison data={data as MonthlyComparisonData} viewMode="side-by-side" />
                      ) : comparisonMode === "major-draw" ? (
                        <>
                          <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 mb-4">
                            <MajorDrawSelector
                              currentDrawId={currentDrawId}
                              previousDrawId={previousDrawId}
                              onCurrentDrawChange={handleCurrentDrawChange}
                              onPreviousDrawChange={handlePreviousDrawChange}
                            />
                          </div>
                          {hasMajorDrawComparison ? (
                            <MajorDrawComparison data={majorDrawComparisonData} viewMode="side-by-side" />
                          ) : (
                            <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 text-center">
                              <p className="text-gray-600 mb-2">Please select both current and previous major draws to compare.</p>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 text-center">
                          <p className="text-gray-600 mb-2">No comparison data available.</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 text-center">
                      <p className="text-gray-600 mb-2">Comparison is only available in Month view mode.</p>
                      <p className="text-sm text-gray-500">
                        Please switch to &quot;Month&quot; filter mode to see comparisons.
                      </p>
                    </div>
                  )
                )}

                {/* Revenue Breakdown - Show in custom or all-time date mode */}
                {(filterMode === "custom" || filterMode === "all-time") && dailyMetricsData && dailyMetricsData.length > 0 && (
                  <RevenueBreakdown metrics={dailyMetricsData} />
                )}
              </>
            )}
        </>
      ) : (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 text-center">
          <p className="text-gray-600 mb-2">No metrics data available for the selected period.</p>
          <p className="text-sm text-gray-500">
              Data will be automatically aggregated from Facebook Ads and Payment Events.
          </p>
        </div>
      )}
      </div>
    </MetricsErrorBoundary>
  );
}
