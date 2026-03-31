"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useDailyUserMetrics } from "@/hooks/useDailyUserMetrics";
import { useUserMetrics } from "@/hooks/useUserMetrics";
import { SignupSourceChart } from "./users/SignupSourceChart";
import { ProfessionBreakdown } from "./users/ProfessionBreakdown";
import { MembershipLifecycleChart } from "./users/MembershipLifecycleChart";
import { DailyUserMetricsTable } from "./users/DailyUserMetricsTable";
import { MetricsDateFilter, MetricsDateFilterMode } from "./shared/MetricsDateFilter";
import { getWebsiteLaunchDateUTC } from "@/utils/common/timezone";
import { ViewSwitcher } from "./shared/ViewSwitcher";
import { ComparisonModeToggle, ComparisonMode } from "./shared/ComparisonModeToggle";
import { MajorDrawSelector } from "./shared/MajorDrawSelector";
import { useUserMajorDrawComparison } from "@/hooks/useUserMajorDrawComparison";
import type { UserMajorDrawComparisonData } from "@/services/metrics/UserMajorDrawComparisonService";
import { MetricCard } from "./shared/MetricCard";
import CustomDateRangeModal from "@/components/admin/CustomDateRangeModal";
import { Skeleton } from "@/components/ui/skeleton";
import { format, startOfMonth, endOfMonth, parseISO, startOfDay } from "date-fns";
import { Users, CreditCard, DollarSign, TrendingUp } from "lucide-react";
import { useMajorDrawsForDateRange } from "@/hooks/queries/useAdminQueries";

export function UserMetricsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // State management - synced with URL params
  const [filterMode, setFilterMode] = useState<MetricsDateFilterMode>(
    (searchParams.get("filterMode") as MetricsDateFilterMode) || "month"
  );
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const month = searchParams.get("month");
    if (month) return month;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [startDate, setStartDate] = useState<string>(searchParams.get("startDate") || "");
  const [endDate, setEndDate] = useState<string>(searchParams.get("endDate") || "");
  const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);
  
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
  // Use "metricsViewMode" to avoid conflict with parent UsersManagement's "viewMode" param
  const urlMetricsViewMode = searchParams.get("metricsViewMode") as "table" | "chart" | null;
  const [viewMode, setViewMode] = useState<"table" | "chart">(urlMetricsViewMode || "chart");
  
  // Initialize metricsViewMode in URL if not present (default to chart) and sync with URL
  useEffect(() => {
    const currentUrlMetricsViewMode = searchParams.get("metricsViewMode") as "table" | "chart" | null;
    
    if (!currentUrlMetricsViewMode) {
      // Initialize to "chart" if not in URL
      const params = new URLSearchParams(searchParams.toString());
      params.set("metricsViewMode", "chart");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      setViewMode("chart");
    } else {
      // Sync state with URL
      setViewMode((prev) => {
        if (prev !== currentUrlMetricsViewMode) {
          return currentUrlMetricsViewMode;
        }
        return prev;
      });
    }
  }, [searchParams, pathname, router]);

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
    return undefined;
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
    return undefined;
  }, [filterMode, endDate, selectedMonth]);

  // Fetch daily user metrics
  const { data: dailyMetricsData, isLoading: dailyLoading } = useDailyUserMetrics({
    startDate: startDateObj || new Date(),
    endDate: endDateObj || new Date(),
    enabled: (filterMode === "custom" || filterMode === "all-time") && !!startDateObj && !!endDateObj,
  });

  // Fetch aggregate metrics - always fetch for stats cards, also used for charts
  const { data: aggregateData, isLoading: aggregateLoading } = useUserMetrics({
    startDate: startDateObj,
    endDate: endDateObj,
    enabled: !!startDateObj && !!endDateObj && (filterMode !== "month" || comparisonMode === "month"), // Only fetch if not in major-draw comparison mode
  });

  const { data: userMajorDrawComparisonData, isLoading: userMajorDrawLoading, error: userMajorDrawError } = useUserMajorDrawComparison({
    currentDrawId: currentDrawId || "",
    previousDrawId: previousDrawId || "",
    enabled: filterMode === "month" && comparisonMode === "major-draw" && !!currentDrawId && !!previousDrawId,
  });

  const isLoading = dailyLoading || aggregateLoading;

  // Calculate summary - prefer aggregateData when available (more accurate), otherwise use dailyMetricsData
  const summary = useMemo(() => {
    // If we have aggregateData (chart view), use it for stats cards
    if (aggregateData) {
      const totalUsers = Object.values(aggregateData.signupSource).reduce((sum, count) => sum + count, 0);
      const averageOrderValue = aggregateData.purchaseHistory.totalPurchases > 0 
        ? aggregateData.purchaseHistory.totalRevenue / aggregateData.purchaseHistory.totalPurchases 
        : 0;

      return {
        totalUsers,
        newSignups: totalUsers, // For the date range, new signups = total users in range
        activeMemberships: aggregateData.membershipStatus.active,
        cancelledMemberships: aggregateData.membershipStatus.cancelled,
        expiredMemberships: aggregateData.membershipStatus.pastDue,
        renewedMemberships: aggregateData.membershipStatus.renewed,
        totalPurchases: aggregateData.purchaseHistory.totalPurchases,
        totalRevenue: aggregateData.purchaseHistory.totalRevenue,
        averageOrderValue,
      };
    }

    // Fallback to dailyMetricsData summary
    if (!dailyMetricsData || dailyMetricsData.length === 0) {
      return {
        totalUsers: 0,
        newSignups: 0,
        activeMemberships: 0,
        cancelledMemberships: 0,
        expiredMemberships: 0,
        renewedMemberships: 0,
        totalPurchases: 0,
        totalRevenue: 0,
        averageOrderValue: 0,
      };
    }

    const totals = dailyMetricsData.reduce(
      (acc, day) => ({
        totalUsers: acc.totalUsers + day.totalUsers,
        newSignups: acc.newSignups + day.newSignups,
        activeMemberships: acc.activeMemberships + day.activeMemberships,
        cancelledMemberships: acc.cancelledMemberships + day.cancelledMemberships,
        expiredMemberships: acc.expiredMemberships + day.expiredMemberships,
        renewedMemberships: acc.renewedMemberships + day.renewedMemberships,
        totalPurchases: acc.totalPurchases + day.totalPurchases,
        totalRevenue: acc.totalRevenue + day.totalRevenue,
      }),
      {
        totalUsers: 0,
        newSignups: 0,
        activeMemberships: 0,
        cancelledMemberships: 0,
        expiredMemberships: 0,
        renewedMemberships: 0,
        totalPurchases: 0,
        totalRevenue: 0,
      }
    );

    const averageOrderValue = totals.totalPurchases > 0 ? totals.totalRevenue / totals.totalPurchases : 0;

    return {
      ...totals,
      averageOrderValue,
    };
  }, [dailyMetricsData, aggregateData]);

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

  // Update URL params when filter changes
  const updateURLParams = (updates: {
    filterMode?: MetricsDateFilterMode;
    month?: string;
    startDate?: string;
    endDate?: string;
    metricsViewMode?: "table" | "chart";
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
    if (updates.metricsViewMode !== undefined) {
      params.set("metricsViewMode", updates.metricsViewMode);
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

  // Handle view mode change
  const handleViewModeChange = (mode: "table" | "chart") => {
    setViewMode(mode);
    updateURLParams({ metricsViewMode: mode });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">User Metrics</h2>
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
                <label htmlFor="month-select" className="text-sm font-medium text-gray-700 dark:text-neutral-200 whitespace-nowrap hidden sm:inline">
                  Month:
                </label>
                <select
                  id="month-select"
                  value={selectedMonth}
                  onChange={(e) => handleMonthSelect(e.target.value)}
                  className="px-3 py-2 border-2 border-gray-300 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm bg-white dark:bg-neutral-800 font-semibold text-gray-900 dark:text-white flex-1 sm:flex-none min-w-[140px]"
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

          {/* View Switcher (Table/Chart only) */}
          <div className="flex-shrink-0">
            <ViewSwitcher 
              currentView={viewMode} 
              onViewChange={(mode) => handleViewModeChange(mode as "table" | "chart")} 
            />
          </div>
        </div>
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
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          {/* Stats Cards - Always visible */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <MetricCard
              title="New Signups"
              value={summary.newSignups.toLocaleString()}
              subtitle="Users who signed up"
              icon={Users}
              color="blue"
            />
            <MetricCard
              title="Active Memberships"
              value={summary.activeMemberships.toLocaleString()}
              subtitle="Currently active"
              icon={CreditCard}
              color="emerald"
            />
            <MetricCard
              title="Total Revenue"
              value={`$${summary.totalRevenue.toLocaleString("en-AU", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`}
              subtitle="Total revenue"
              icon={DollarSign}
              color="emerald"
            />
            <MetricCard
              title="Average Order Value"
              value={`$${summary.averageOrderValue.toLocaleString("en-AU", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`}
              subtitle="Per purchase"
              icon={TrendingUp}
              color="purple"
            />
          </div>

          {/* Table View (default) */}
          {viewMode === "table" && dailyMetricsData && dailyMetricsData.length > 0 && (
            <DailyUserMetricsTable metrics={dailyMetricsData} />
          )}

          {/* Chart View */}
          {viewMode === "chart" && aggregateData && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SignupSourceChart data={aggregateData.signupSource} />
                <MembershipLifecycleChart data={aggregateData.membershipStatus} />
              </div>

              <ProfessionBreakdown data={aggregateData.profession} />

             
            </div>
          )}

          {/* No data state */}
          {(!dailyMetricsData || dailyMetricsData.length === 0) && viewMode === "table" && (
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-6 text-center">
              <p className="text-gray-600 dark:text-neutral-400">No user metrics data available for the selected period.</p>
            </div>
          )}

          {viewMode === "chart" && !aggregateData && (
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-6 text-center">
              <p className="text-gray-600 dark:text-neutral-400">No user metrics data available for the selected period.</p>
            </div>
          )}

          {/* Major Draw Comparison Section - Show when in month mode and major-draw comparison mode */}
          {filterMode === "month" && comparisonMode === "major-draw" && (
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-6 space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Major Draw Comparison</h3>
              <MajorDrawSelector
                currentDrawId={currentDrawId}
                previousDrawId={previousDrawId}
                onCurrentDrawChange={handleCurrentDrawChange}
                onPreviousDrawChange={handlePreviousDrawChange}
              />
              {userMajorDrawComparisonData ? (
                <div className="space-y-4">
                  {/* Comparison Table */}
                  <UserMajorDrawComparisonTable data={userMajorDrawComparisonData} />
                </div>
              ) : userMajorDrawLoading ? (
                <div className="text-center py-8">
                  <p className="text-gray-600 dark:text-neutral-400">Loading comparison data...</p>
                </div>
              ) : userMajorDrawError ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-700">Error loading comparison: {userMajorDrawError instanceof Error ? userMajorDrawError.message : "Unknown error"}</p>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-600 dark:text-neutral-400">
                  <p>Please select both current and previous major draws to compare.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// User Major Draw Comparison Table Component
function UserMajorDrawComparisonTable({ data }: { data: UserMajorDrawComparisonData }) {
  const { currentDrawTotal, previousDrawTotal, comparison, currentDrawInfo, previousDrawInfo } = data;

  const metrics = [
    {
      label: "Total Users",
      current: currentDrawTotal.totalUsers,
      previous: previousDrawTotal.totalUsers,
      comparison: comparison.totalUsers,
      format: (val: number) => val.toLocaleString(),
    },
    {
      label: "New Signups",
      current: currentDrawTotal.newSignups,
      previous: previousDrawTotal.newSignups,
      comparison: comparison.newSignups,
      format: (val: number) => val.toLocaleString(),
    },
    {
      label: "Active Memberships",
      current: currentDrawTotal.activeMemberships,
      previous: previousDrawTotal.activeMemberships,
      comparison: comparison.activeMemberships,
      format: (val: number) => val.toLocaleString(),
    },
    {
      label: "Total Purchases",
      current: currentDrawTotal.totalPurchases,
      previous: previousDrawTotal.totalPurchases,
      comparison: comparison.totalPurchases,
      format: (val: number) => val.toLocaleString(),
    },
    {
      label: "Total Revenue",
      current: currentDrawTotal.totalRevenue,
      previous: previousDrawTotal.totalRevenue,
      comparison: comparison.totalRevenue,
      format: (val: number) => `$${val.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
    {
      label: "Average Order Value",
      current: currentDrawTotal.averageOrderValue,
      previous: previousDrawTotal.averageOrderValue,
      comparison: comparison.averageOrderValue,
      format: (val: number) => `$${val.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
  ];

  return (
    <div className="overflow-x-auto">
      <div className="mb-4 text-sm text-gray-600 dark:text-neutral-400">
        <div className="flex flex-col sm:flex-row gap-4">
          <div>
            <span className="font-semibold text-gray-900 dark:text-white">Current: </span>
            {currentDrawInfo.name} ({format(new Date(currentDrawInfo.activationDate), "MMM d")} - {format(new Date(currentDrawInfo.drawDate), "MMM d, yyyy")})
          </div>
          <div>
            <span className="font-semibold text-gray-900 dark:text-white">Previous: </span>
            {previousDrawInfo.name} ({format(new Date(previousDrawInfo.activationDate), "MMM d")} - {format(new Date(previousDrawInfo.drawDate), "MMM d, yyyy")})
          </div>
        </div>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b-2 border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800">
            <th className="text-left py-3 px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">Metric</th>
            <th className="text-right py-3 px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">Current Draw</th>
            <th className="text-right py-3 px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">Previous Draw</th>
            <th className="text-right py-3 px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">Change</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => (
            <tr
              key={metric.label}
              className="border-b border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors"
            >
              <td className="py-3 px-4 text-sm text-gray-900 dark:text-white font-medium">{metric.label}</td>
              <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-white font-semibold tabular-nums">
                {metric.format(metric.current)}
              </td>
              <td className="py-3 px-4 text-sm text-right text-gray-600 dark:text-neutral-400 tabular-nums">
                {metric.format(metric.previous)}
              </td>
              <td className="py-3 px-4 text-sm text-right">
                <div className="flex items-center justify-end gap-2">
                  <span className={`text-xs font-semibold ${
                    metric.comparison.direction === "up"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : metric.comparison.direction === "down"
                        ? "text-red-600 dark:text-red-400"
                        : "text-gray-600 dark:text-neutral-400"
                  }`}>
                    {metric.comparison.percentage > 0 ? "+" : ""}{metric.comparison.percentage.toFixed(1)}%
                  </span>
                  <span className="text-xs text-gray-600 dark:text-neutral-400">
                    ({metric.comparison.value > 0 ? "+" : ""}{metric.format(metric.comparison.value)})
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
