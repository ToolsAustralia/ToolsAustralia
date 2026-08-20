"use client";

import React, { useState, useMemo } from "react";
import { format } from "date-fns";
import KpiGrid from "./sections/KpiGrid";
import RevenueChartCard from "./sections/RevenueChartCard";
import MembershipCard from "./sections/MembershipCard";
import RevenueBreakdownCard from "./sections/RevenueBreakdownCard";
import AdvertisingPlatformCard from "./sections/AdvertisingPlatformCard";
import MerByDrawCard from "./sections/MerByDrawCard";
import BrandPerformanceCard from "./sections/BrandPerformanceCard";
import PeriodComparisonCard from "./sections/PeriodComparisonCard";
import TopDrawsCard from "./sections/TopDrawsCard";
import UpcomingRenewalsCard from "./sections/UpcomingRenewalsCard";
import ActivityCard from "./sections/ActivityCard";
import QuickActionsCard from "./sections/QuickActionsCard";
import UsersBreakdownSection from "./UsersBreakdownSection";
import { AdminDateRangeToolbar } from "@/components/admin/AdminDateRangeToolbar";
import {
  useAdminDashboardStats,
  useCurrentAndLastDrawDates,
  useMembershipByPackage,
} from "@/hooks/queries/useAdminQueries";
import { useAdminDateFilter } from "@/hooks/useAdminDateFilter";
import { useAdminUserModal } from "@/contexts/AdminUserModalContext";

export default function DashboardOverview() {
  /**
   * Date filter — the SHARED hook every other analytics tab uses, with URL sync on so the
   * range survives a refresh and stays deep-linkable (the behaviour this page had when it
   * carried ~90 lines of its own state machinery, an effect, and a duplicate AEST resolver).
   * The toolbar hosts its own custom-range modal and fetches its own major-draw list, so both
   * are gone from here too.
   */
  const df = useAdminDateFilter("today", { syncToUrl: true });
  const { dateRange } = df;

  // Section expand/collapse state — mobile starts collapsed; desktop always shows breakdowns via isLgUp || …
  const [isUsersBreakdownExpanded, setIsUsersBreakdownExpanded] = useState(false);

  // Click-to-open user modal — passed down to the detail modals hosted inside the
  // Membership and Revenue breakdown cards.
  const { openUserModal } = useAdminUserModal();

  // Draw names for the per-card KPI labels (the toolbar resolves draw WINDOWS itself).
  const { data: drawDates } = useCurrentAndLastDrawDates();

  /**
   * Explicit dates are forwarded to children only for the presets that CARRY them.
   *
   * `useAdminDateFilter` always resolves a concrete window, but the query hooks treat a
   * present start/end as part of their cache key and only forward it to the route for
   * custom/draw ranges. Passing a resolved "today" pair would therefore re-key every cached
   * query once per day for no behavioural gain. This preserves the exact contract the page
   * had before the hook was adopted.
   */
  const carriesDates =
    dateRange === "custom" || dateRange === "current-draw" || dateRange === "last-draw";
  const childStartDate = carriesDates ? df.startDate || undefined : undefined;
  const childEndDate = carriesDates ? df.endDate || undefined : undefined;

  // Fetch admin dashboard stats with date range filtering
  const {
    data: dashboardStats,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useAdminDashboardStats(dateRange, childStartDate, childEndDate);

  // Fetch membership data for the KPI grid + membership donut
  const { data: membershipByPackageData, isLoading: membershipLoading } = useMembershipByPackage(
    dateRange,
    childStartDate,
    childEndDate
  );

  // Format abbreviated date for the per-card KPI tag (longer than the toolbar's own compact
  // trigger label, which the shared hook derives).
  const formatAbbreviatedDate = (startDate: string, endDate: string): string => {
    if (!startDate || !endDate) return "";

    try {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd")) {
        return format(start, "MMM d, yyyy");
      }

      return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`;
    } catch {
      return "";
    }
  };

  // Per-card date tag for the KPI grid — e.g. "Revenue (Today)" / "(Nov 2025 – present)"
  // / the active draw name. Draw names + the all-time launch month live here (KpiGrid
  // only receives the resolved string).
  const kpiRangeLabel = useMemo(() => {
    switch (dateRange) {
      case "today":
        return "Today";
      case "yesterday":
        return "Yesterday";
      case "current-draw":
        return drawDates?.currentDraw?.name ?? "Current draw";
      case "last-draw":
        return drawDates?.lastDraw?.name ?? "Last draw";
      case "all-time": {
        const start = dashboardStats?.dateRange?.start;
        return start ? `${format(new Date(start), "MMM yyyy")} – present` : "All time";
      }
      case "custom":
        return df.startDate && df.endDate
          ? formatAbbreviatedDate(df.startDate, df.endDate)
          : "Custom";
      default:
        return "";
    }
  }, [dateRange, drawDates, dashboardStats, df.startDate, df.endDate]);

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Direct child, NOT wrapped: the toolbar is sticky on desktop and a wrapper sized to
          the control would be the only box it could travel within — pinning it to nothing. */}
      <AdminDateRangeToolbar filter={df} />

      {/* New KPI grid (redesign Phase 2) — replaces the old KPIMetricsGrid */}
      <KpiGrid
        stats={dashboardStats}
        membership={membershipByPackageData}
        dateRange={dateRange}
        rangeLabel={kpiRangeLabel}
        statsLoading={statsLoading}
        membershipLoading={membershipLoading}
        startDate={childStartDate}
        endDate={childEndDate}
      />

      {/* Revenue breakdown + advertising by platform — same row, above the charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
        <RevenueBreakdownCard
          stats={dashboardStats}
          loading={statsLoading}
          dateRange={dateRange}
          startDate={childStartDate}
          endDate={childEndDate}
          onUserClick={openUserModal}
        />
        <AdvertisingPlatformCard
          stats={dashboardStats}
          loading={statsLoading}
          dateRange={dateRange}
          startDate={childStartDate}
          endDate={childEndDate}
          onUserClick={openUserModal}
        />
      </div>

      {/* Marketing Efficiency Ratio per draw — New Revenue ÷ Ad Spend, with a
          per-platform breakdown. Self-contained (own per-draw windows), so it
          deliberately ignores the page date filter. Sits above the revenue
          overview + active-memberships (charts) row. */}
      <MerByDrawCard />

      {/* Charts row (redesign Phase 3) — revenue area chart + membership donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6">
        <div className="lg:col-span-2 min-w-0">
          <RevenueChartCard />
        </div>
        <div className="lg:col-span-1 min-w-0">
          <MembershipCard
            data={membershipByPackageData}
            loading={membershipLoading}
            onUserClick={openUserModal}
          />
        </div>
      </div>

      {/* Selected period vs the previous calendar month. Sits directly above Brand
          performance so the two "how did we do" reads are together. */}
      <PeriodComparisonCard
        stats={dashboardStats}
        statsLoading={statsLoading}
        startDate={df.startDate}
        endDate={df.endDate}
        rangeLabel={kpiRangeLabel}
      />

      {/* Brand performance — spend & return by brand lane (toolset / toolbox) */}
      <BrandPerformanceCard
        dateRange={dateRange}
        startDate={childStartDate}
        endDate={childEndDate}
      />

      {/* Row 4 — top draws (placeholder) + upcoming renewals (redesign Phase 5) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6">
        <div className="lg:col-span-2 min-w-0">
          <TopDrawsCard />
        </div>
        <div className="lg:col-span-1 min-w-0">
          <UpcomingRenewalsCard />
        </div>
      </div>

      {/* Row 5 — recent activity + quick actions (redesign Phase 5) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6">
        <div className="lg:col-span-2 min-w-0">
          <ActivityCard />
        </div>
        <div className="lg:col-span-1 min-w-0">
          <QuickActionsCard onRefreshStats={() => refetchStats()} />
        </div>
      </div>

      {/* Users Breakdown — last content row; age + profession tables (retained until the Users page exists) */}
      <UsersBreakdownSection
        isExpanded={isUsersBreakdownExpanded}
        onToggleExpand={() => setIsUsersBreakdownExpanded(!isUsersBreakdownExpanded)}
      />

      {/* The custom-range modal and its major-draw list live inside AdminDateRangeToolbar —
          one copy for every date-filtered admin tab, rather than one per page. */}
    </div>
  );
}
