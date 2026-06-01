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
  RefreshCw,
} from "lucide-react";
import type { DateRange } from "@/components/admin/DateRangeToggle";
import type { TrendData } from "@/types/admin/trend-types";
import { cn } from "@/utils/cn";

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
    renewalProgress?: {
      base: number;
      renewed: number;
      rate: number | null;
      remaining: number;
      baseAsOf: string | null;
      isComplete: boolean;
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
  attributedRevenue?: Record<string, {
    revenue: number;
    renewalRevenue: number;
    conversions: number;
    byConfidence: { click: number; utm_only: number; inferred_backfill: number };
    adSpend?: number;
    trueRoas?: number;
    revenueTrend?: TrendData;
    trueRoasTrend?: TrendData;
  }>;
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

        {/* Revenue by Platform (attributed revenue) */}
        {(() => {
          const attrRev = dashboardStats?.attributedRevenue;
          if (!attrRev || Object.keys(attrRev).length === 0) return null;

          const PLATFORM_LABELS: Record<string, string> = {
            meta: "Meta",
            tiktok: "TikTok",
            snapchat: "Snapchat",
            klaviyo_email: "Klaviyo Email",
            klaviyo_sms: "Klaviyo SMS",
            google: "Google",
            direct: "Direct / Organic",
            other: "Other",
          };

          const fmt = (n: number) =>
            `$${n.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

          const entries = Object.entries(attrRev);

          return (
            <div className="bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl border border-gray-200 dark:border-neutral-700 shadow-sm dark:shadow-none mt-3">
              <div className="px-3 sm:px-4 lg:px-5 pt-3 sm:pt-4 lg:pt-5 pb-2 sm:pb-3">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white leading-snug">
                  Revenue by Platform
                </h3>
                <p className="text-2xs sm:text-xs text-gray-500 dark:text-neutral-400 mt-0.5 sm:mt-1 leading-snug">
                  Acquisition revenue per channel · ROAS = ad revenue ÷ spend · renewals excluded
                </p>
              </div>
              <div className="px-3 sm:px-4 lg:px-5 pb-3 sm:pb-4 lg:pb-5 space-y-2 sm:space-y-2.5">
                {entries.map(([platform, data]) => {
                  const label = PLATFORM_LABELS[platform] ?? platform;
                  const estimated = data.byConfidence.utm_only + data.byConfidence.inferred_backfill;
                  const trendDir = data.revenueTrend?.direction;
                  const roasTrendDir = data.trueRoasTrend?.direction;
                  return (
                    <div
                      key={platform}
                      className="flex flex-col gap-0.5 rounded-lg border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/50 px-3 py-2 sm:px-4 sm:py-2.5"
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="text-2xs sm:text-xs font-semibold text-gray-600 dark:text-neutral-300 uppercase tracking-wide truncate">
                          {label}
                        </span>
                        <div className="flex items-center gap-2 shrink-0 tabular-nums">
                          <div className="flex flex-col items-end">
                            <div className="flex items-center gap-1.5">
                              <span className="text-2xs sm:text-xs text-gray-500 dark:text-neutral-400 font-medium">Ad revenue</span>
                              <span className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
                                {fmt(data.revenue)}
                              </span>
                              {trendDir && data.revenueTrend && (
                                <span
                                  className={`text-2xs sm:text-xs font-semibold ${
                                    trendDir === "up"
                                      ? "text-emerald-600"
                                      : trendDir === "down"
                                      ? "text-red-600"
                                      : "text-gray-500 dark:text-neutral-400"
                                  }`}
                                >
                                  {trendDir === "up" ? "↑" : trendDir === "down" ? "↓" : "→"}{" "}
                                  {Math.abs(data.revenueTrend.value)}%
                                </span>
                              )}
                            </div>
                            {data.renewalRevenue > 0 && (
                              <span className="text-2xs text-gray-500 dark:text-neutral-400 tabular-nums">
                                + {fmt(data.renewalRevenue)} recurring renewals · not in ROAS
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-2xs sm:text-xs text-gray-500 dark:text-neutral-400">
                          {fmt(data.byConfidence.click)} click
                          {estimated > 0 && <> · {fmt(estimated)} estimated</>}
                        </span>
                        <div className="flex items-center gap-2 shrink-0 tabular-nums">
                          <span className="text-2xs sm:text-xs text-gray-500 dark:text-neutral-400">
                            {data.conversions.toLocaleString()} conv.
                          </span>
                          {data.trueRoas !== undefined && (
                            <span className="flex items-center gap-1 text-2xs sm:text-xs font-semibold text-blue-700 dark:text-blue-400">
                              {data.trueRoas.toFixed(2)}x ROAS
                              {roasTrendDir && data.trueRoasTrend && (
                                <span
                                  className={`font-semibold ${
                                    roasTrendDir === "up"
                                      ? "text-emerald-600"
                                      : roasTrendDir === "down"
                                      ? "text-red-600"
                                      : "text-gray-500 dark:text-neutral-400"
                                  }`}
                                >
                                  {roasTrendDir === "up" ? "↑" : roasTrendDir === "down" ? "↓" : "→"}{" "}
                                  {Math.abs(data.trueRoasTrend.value)}%
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
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
          <div className={cn(!isUsersPerformanceExpanded ? "hidden lg:block" : "")}>
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
          <div className={cn(!isUsersPerformanceExpanded ? "hidden lg:block" : "")}>
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

          {(() => {
            const rp = dashboardStats?.users?.renewalProgress;
            if (!rp) return null;
            return (
              <MetricCard
                title="Renewal Rate"
                value={rp.rate != null ? `${rp.rate}%` : "—"}
                icon={RefreshCw}
                color="emerald"
                subtitle={
                  <span className="text-2xs sm:text-2xs leading-tight text-gray-500">
                    {rp.renewed.toLocaleString("en-AU")} of {rp.base.toLocaleString("en-AU")} renewed
                    {rp.remaining > 0 && (
                      <>
                        {" · "}
                        {rp.remaining.toLocaleString("en-AU")}{" "}
                        {rp.isComplete ? "did not renew" : "expected"}
                      </>
                    )}
                    {rp.baseAsOf && (
                      <span className="block text-gray-600">base as of {rp.baseAsOf}</span>
                    )}
                  </span>
                }
                loading={loading}
              />
            );
          })()}
        </div>
      </div>
    </div>
  );
}
