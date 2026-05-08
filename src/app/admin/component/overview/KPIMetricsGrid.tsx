"use client";

import React from "react";
import { format } from "date-fns";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import {
  Users,
  DollarSign,
  Target,
  UserCheck,
  BarChart3,
  TrendingUp,
  UserX,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { DateRange } from "@/components/admin/DateRangeToggle";
import type { TrendData } from "@/types/admin/trend-types";

interface DashboardStats {
  revenue: {
    total: number;
    totalTrend?: TrendData;
  };
  users: {
    total: number;
    totalTrend?: TrendData;
    newInRange: number;
    newInRangeTrend?: TrendData;
    cancelledMemberships?: number;
    cancelledMembershipsTrend?: TrendData;
    dropOffRate: number;
    dropOffRateTrend?: TrendData;
    periodChurnRate?: number;
    cancellationImpact?: {
      estimatedMonthlyRevenue: number;
    };
  };
  conversionRate: number;
  conversionRateTrend?: TrendData;
  facebookAds?: {
    spend: number;
    spendTrend?: TrendData;
    roas: number;
    roasTrend?: TrendData;
  };
}

interface MembershipSummary {
  totalActiveRevenue: number;
  totalActiveCount: number;
  totalPastDueCount: number;
}

interface KPIMetricsGridProps {
  dashboardStats: DashboardStats | undefined;
  membershipSummary: MembershipSummary | undefined;
  dateRange: DateRange;
  loading: boolean;
  error: Error | null;
  onRevenueClick: () => void;
  onMembershipClick: () => void;
  membershipLoading?: boolean;
  /** "live" → current counts; "snapshot" → counts as of `membershipAsOf`. */
  membershipAsOfMode?: "live" | "snapshot";
  /** ISO date string of the snapshot date when in snapshot mode; null otherwise. */
  membershipAsOf?: string | null;
  revenueBreakdownSection?: React.ReactNode;
  membershipBreakdownSection?: React.ReactNode;
  upcomingRenewalsSection?: React.ReactNode;
  isRevenueExpanded: boolean;
  onRevenueExpandToggle: () => void;
  isAdvertisingExpanded: boolean;
  onAdvertisingExpandToggle: () => void;
  advertisingBreakdownSection?: React.ReactNode;
  /** Mobile/tablet: toggles Total Users + Drop-off Rate visibility (desktop lg+ always shows all four) */
  isUsersPerformanceExpanded: boolean;
  onUsersPerformanceExpandToggle: () => void;
}

export default function KPIMetricsGrid({
  dashboardStats,
  membershipSummary,
  dateRange,
  loading,
  error,
  onRevenueClick,
  onMembershipClick,
  membershipLoading = false,
  membershipAsOfMode,
  membershipAsOf,
  revenueBreakdownSection,
  membershipBreakdownSection,
  upcomingRenewalsSection,
  isRevenueExpanded,
  onRevenueExpandToggle,
  isAdvertisingExpanded,
  onAdvertisingExpandToggle,
  advertisingBreakdownSection,
  isUsersPerformanceExpanded,
  onUsersPerformanceExpandToggle,
}: KPIMetricsGridProps) {
  // For cancellations: up is bad, down is good - flip direction for display
  const getTrendForDisplay = (
    trend: TrendData | undefined,
    invertedPositive = false
  ): { value: number; direction: "up" | "down" | "neutral" } | undefined => {
    if (!trend) return undefined;
    if (invertedPositive && trend.direction !== "neutral") {
      return {
        ...trend,
        direction: trend.direction === "up" ? "down" : "up",
      };
    }
    return { value: trend.value, direction: trend.direction };
  };

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="flex items-center space-x-2">
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-red-700 font-medium">Failed to load dashboard data</span>
        </div>
        <p className="text-red-600 text-sm mt-1">{error.message || "Unknown error occurred"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Revenue Metrics Group */}
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Revenue</div>
          <button
            type="button"
            onClick={onRevenueExpandToggle}
            className="lg:hidden text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-300 transition-colors p-1"
            aria-label={isRevenueExpanded ? "Collapse revenue details" : "Expand revenue details"}
          >
            {isRevenueExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-2 gap-2 sm:gap-3 lg:gap-4">
          {/* Total Revenue - Clickable */}
          <div onClick={onRevenueClick} className="cursor-pointer group relative">
            <MetricCard
              title={
                dateRange === "today"
                  ? "Today's Revenue"
                  : dateRange === "yesterday"
                  ? "Yesterday's Revenue"
                  : dateRange === "all-time"
                  ? "Total Revenue"
                  : "Revenue"
              }
              value={loading ? "..." : `$${dashboardStats?.revenue.total.toLocaleString() ?? 0}`}
              icon={DollarSign}
              subtitle={
                dateRange === "today"
                  ? "From all sources"
                  : dateRange === "yesterday"
                  ? "From all sources"
                  : dateRange === "all-time"
                  ? "All-time total"
                  : "Selected period"
              }
              color="emerald"
              trend={dashboardStats?.revenue.totalTrend}
              loading={loading}
              clickable={true}
            />
          </div>

          {/* Membership Revenue - Clickable */}
          <div onClick={onMembershipClick} className="cursor-pointer group relative">
            <MetricCard
              title={
                membershipAsOfMode === "snapshot" && membershipAsOf
                  ? `Membership Statuses (as of ${format(new Date(membershipAsOf), "MMM d")})`
                  : "Membership Statuses"
              }
              value={
                membershipLoading
                  ? "..."
                  : `$${(membershipSummary?.totalActiveRevenue ?? 0).toLocaleString("en-AU", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
              }
              icon={TrendingUp}
              subtitle={
                <span className="text-2xs sm:text-2xs leading-tight text-gray-500">
                  {(membershipSummary?.totalActiveCount ?? 0).toLocaleString()} active
                  {(membershipSummary?.totalPastDueCount ?? 0) > 0 && (
                    <> · {(membershipSummary?.totalPastDueCount ?? 0).toLocaleString()} past due</>
                  )}
                </span>
              }
              color="red"
              loading={membershipLoading}
              clickable={true}
            />
          </div>

          {/* Ad Spend (also shown under Advertising) */}
          <MetricCard
            title={
              dateRange === "today"
                ? "Ad Spend"
                : dateRange === "yesterday"
                  ? "Ad Spend"
                  : dateRange === "all-time"
                    ? "Total Ad Spend"
                    : "Ad Spend"
            }
            value={
              loading
                ? "..."
                : `$${(dashboardStats?.facebookAds?.spend || 0).toLocaleString("en-AU", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
            }
            icon={BarChart3}
            subtitle={
              dateRange === "today"
                ? "Facebook Ads spend"
                : dateRange === "yesterday"
                  ? "Facebook Ads spend"
                  : dateRange === "all-time"
                    ? "All-time Facebook Ads"
                    : "Facebook Ads spend"
            }
            color="blue"
            trend={dashboardStats?.facebookAds?.spendTrend}
            loading={loading}
          />

          {/* ROAS (also shown under Advertising) */}
          <MetricCard
            title="ROAS"
            value={loading ? "..." : `${(dashboardStats?.facebookAds?.roas || 0).toFixed(2)}x`}
            icon={Target}
            subtitle="Return on ad spend"
            color="green"
            trend={dashboardStats?.facebookAds?.roasTrend}
            loading={loading}
          />
        </div>
        
        {/* Revenue Breakdown Sections - Integrated within Revenue Group */}
        {revenueBreakdownSection}
        {membershipBreakdownSection}
        {upcomingRenewalsSection}
      </div>

      {/* Ads Group */}
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Advertising</div>
          <button
            type="button"
            onClick={onAdvertisingExpandToggle}
            className="text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-300 transition-colors p-1"
            aria-label={isAdvertisingExpanded ? "Collapse advertising details" : "Expand advertising details"}
          >
            {isAdvertisingExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-2 gap-2 sm:gap-3 lg:gap-4">
          {/* Ad Spend */}
          <MetricCard
            title={
              dateRange === "today"
                ? "Ad Spend"
                : dateRange === "yesterday"
                ? "Ad Spend"
                : dateRange === "all-time"
                ? "Total Ad Spend"
                : "Ad Spend"
            }
            value={
              loading
                ? "..."
                : `$${(dashboardStats?.facebookAds?.spend || 0).toLocaleString("en-AU", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
            }
            icon={BarChart3}
            subtitle={
              dateRange === "today"
                ? "Facebook Ads spend"
                : dateRange === "yesterday"
                ? "Facebook Ads spend"
                : dateRange === "all-time"
                ? "All-time Facebook Ads"
                : "Facebook Ads spend"
            }
            color="blue"
            trend={dashboardStats?.facebookAds?.spendTrend}
            loading={loading}
          />

          {/* ROAS */}
          <MetricCard
            title="ROAS"
            value={loading ? "..." : `${(dashboardStats?.facebookAds?.roas || 0).toFixed(2)}x`}
            icon={Target}
            subtitle="Return on ad spend"
            color="green"
            trend={dashboardStats?.facebookAds?.roasTrend}
            loading={loading}
          />
        </div>
        
        {/* Advertising Breakdown Section - Integrated within Advertising Group */}
        {advertisingBreakdownSection}
      </div>

      {/* Users & Performance Group — own chevron on mobile for extra metrics */}
      <div>
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Users & Performance</div>
          <button
            type="button"
            onClick={onUsersPerformanceExpandToggle}
            className="lg:hidden text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-300 transition-colors p-1 shrink-0"
            aria-label={
              isUsersPerformanceExpanded
                ? "Hide total users and cancellations"
                : "Show total users and cancellations"
            }
          >
            {isUsersPerformanceExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
          {/* Total Users — hidden on small screens when Users & Performance row is collapsed */}
          <div className={`${!isUsersPerformanceExpanded ? "hidden lg:block" : ""}`}>
            <MetricCard
              title="Total Users"
              value={loading ? "..." : dashboardStats?.users.total.toLocaleString() ?? "0"}
              icon={Users}
              subtitle="Active users"
              color="indigo"
              trend={dashboardStats?.users.totalTrend}
              loading={loading}
            />
          </div>

          {/* New Signups - Always visible */}
          <MetricCard
            title={
              dateRange === "today"
                ? "New Signups"
                : dateRange === "yesterday"
                ? "New Signups"
                : dateRange === "all-time"
                ? "Total Signups"
                : "New Signups"
            }
            value={loading ? "..." : dashboardStats?.users.newInRange.toLocaleString() ?? "0"}
            icon={UserCheck}
            subtitle={
              dateRange === "today"
                ? "Signed up today"
                : dateRange === "yesterday"
                ? "Signed up yesterday"
                : dateRange === "all-time"
                ? "All-time signups"
                : "In selected period"
            }
            color="blue"
            trend={dashboardStats?.users.newInRangeTrend}
            loading={loading}
          />

          {/* Conversion Rate - Always visible */}
          <MetricCard
            title="Conversion Rate"
            value={loading ? "..." : `${dashboardStats?.conversionRate ?? 0}%`}
            icon={Target}
            subtitle="Paying customers"
            color="indigo"
            trend={dashboardStats?.conversionRateTrend}
            loading={loading}
          />

          {/* Cancellations — hidden on small screens when Users & Performance row is collapsed */}
          <div className={`${!isUsersPerformanceExpanded ? "hidden lg:block" : ""}`}>
            <MetricCard
              title="Cancellations"
              value={
                loading
                  ? "..."
                  : (dashboardStats?.users.cancelledMemberships ?? 0).toLocaleString()
              }
              icon={UserX}
              subtitle={
                <span className="text-2xs sm:text-2xs leading-tight text-gray-500">
                  Est. membership revenue at risk:{" "}
                  <span className="font-semibold text-gray-700 dark:text-neutral-300">
                    $
                    {(dashboardStats?.users.cancellationImpact?.estimatedMonthlyRevenue ?? 0).toLocaleString("en-AU", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  {dateRange === "all-time" ? " (scheduled cancels)" : ""}
                </span>
              }
              color="red"
              trend={getTrendForDisplay(dashboardStats?.users.cancelledMembershipsTrend, true)}
              loading={loading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
