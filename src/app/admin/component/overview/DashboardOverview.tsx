"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { format } from "date-fns";
import OverviewToolbar from "./OverviewToolbar";
import KpiGrid from "./sections/KpiGrid";
import RevenueChartCard from "./sections/RevenueChartCard";
import MembershipCard from "./sections/MembershipCard";
import RevenueBreakdownCard from "./sections/RevenueBreakdownCard";
import AdvertisingPlatformCard from "./sections/AdvertisingPlatformCard";
import PrizePerformanceCard from "./sections/PrizePerformanceCard";
import TopDrawsCard from "./sections/TopDrawsCard";
import UpcomingRenewalsCard from "./sections/UpcomingRenewalsCard";
import ActivityCard from "./sections/ActivityCard";
import QuickActionsCard from "./sections/QuickActionsCard";
import UsersBreakdownSection from "./UsersBreakdownSection";
import CustomDateRangeModal from "@/components/admin/CustomDateRangeModal";
import { DateRange } from "@/components/admin/DateRangeToggle";
import {
  useAdminDashboardStats,
  useCurrentAndLastDrawDates,
  useMajorDrawsForDateRange,
  useMembershipByPackage,
} from "@/hooks/queries/useAdminQueries";
import { useAdminMobileDateToolbarSlot } from "@/hooks/useAdminMobileDateToolbarSlot";
import { useAdminUserModal } from "@/contexts/AdminUserModalContext";

export default function DashboardOverview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Date filter state
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);

  // Section expand/collapse state — mobile starts collapsed; desktop always shows breakdowns via isLgUp || …
  const [isUsersBreakdownExpanded, setIsUsersBreakdownExpanded] = useState(false);

  const { isLgUp, slotEl: mobileToolbarRoot } = useAdminMobileDateToolbarSlot();

  // Click-to-open user modal — passed down to the detail modals hosted inside the
  // Membership and Revenue breakdown cards.
  const { openUserModal } = useAdminUserModal();

  // Sync date filter state with URL params on mount and when URL changes
  useEffect(() => {
    const urlDateRange = (searchParams.get("dateRange") as DateRange) || "today";
    const urlStartDate = searchParams.get("startDate") || "";
    const urlEndDate = searchParams.get("endDate") || "";

    setDateRange(urlDateRange);
    setCustomStartDate(urlStartDate);
    setCustomEndDate(urlEndDate);
  }, [searchParams]);

  // Fetch current and last draw dates
  const { data: drawDates } = useCurrentAndLastDrawDates();

  // Fetch major draws for date range selection
  const { data: majorDraws = [] } = useMajorDrawsForDateRange();

  // Fetch admin dashboard stats with date range filtering
  const {
    data: dashboardStats,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useAdminDashboardStats(
    dateRange,
    customStartDate ? customStartDate : undefined,
    customEndDate ? customEndDate : undefined
  );

  // Fetch membership data for the KPI grid + membership donut
  const { data: membershipByPackageData, isLoading: membershipLoading } = useMembershipByPackage(
    dateRange,
    customStartDate ? customStartDate : undefined,
    customEndDate ? customEndDate : undefined
  );

  // Update URL params when date filter changes
  const updateDateFilter = (range: DateRange, start?: string, end?: string) => {
    // Handle draw-based date ranges
    if (range === "current-draw" && drawDates?.currentDraw) {
      setDateRange(range);
      setCustomStartDate(drawDates.currentDraw.startDate);
      setCustomEndDate(drawDates.currentDraw.endDate);

      const params = new URLSearchParams(searchParams.toString());
      params.set("dateRange", range);
      params.set("startDate", drawDates.currentDraw.startDate);
      params.set("endDate", drawDates.currentDraw.endDate);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      return;
    }

    if (range === "last-draw" && drawDates?.lastDraw) {
      setDateRange(range);
      setCustomStartDate(drawDates.lastDraw.startDate);
      setCustomEndDate(drawDates.lastDraw.endDate);

      const params = new URLSearchParams(searchParams.toString());
      params.set("dateRange", range);
      params.set("startDate", drawDates.lastDraw.startDate);
      params.set("endDate", drawDates.lastDraw.endDate);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      return;
    }

    // Update state immediately for responsive UI
    setDateRange(range);
    if (range === "custom" && start && end) {
      setCustomStartDate(start);
      setCustomEndDate(end);
    } else {
      setCustomStartDate("");
      setCustomEndDate("");
    }

    // Update URL params
    const params = new URLSearchParams(searchParams.toString());
    params.set("dateRange", range);
    if (range === "custom" && start && end) {
      params.set("startDate", start);
      params.set("endDate", end);
    } else {
      params.delete("startDate");
      params.delete("endDate");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Format abbreviated date for display
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

  // Get display date for collapsed view
  const displayDate = useMemo(() => {
    if (dateRange === "custom" && customStartDate && customEndDate) {
      return formatAbbreviatedDate(customStartDate, customEndDate);
    }
    if (dateRange === "all-time") {
      return "All Time";
    }
    if (dateRange === "current-draw" && drawDates?.currentDraw) {
      return "Current Draw";
    }
    if (dateRange === "last-draw" && drawDates?.lastDraw) {
      return "Last Draw";
    }
    return undefined;
  }, [dateRange, customStartDate, customEndDate, drawDates]);

  const overviewToolbarProps = {
    dateRange,
    onRangeChange: (range: DateRange) => {
      if (range === "custom") {
        setIsCustomDateModalOpen(true);
      } else {
        updateDateFilter(range);
      }
    },
    onCustomClick: () => setIsCustomDateModalOpen(true),
    displayDate,
  } as const;

  const toolbarMobileInLayout =
    !isLgUp && mobileToolbarRoot
      ? createPortal(<OverviewToolbar {...overviewToolbarProps} placement="layout" />, mobileToolbarRoot)
      : null;

  const toolbarMobileUntilPortal =
    !isLgUp && !mobileToolbarRoot ? (
      <OverviewToolbar {...overviewToolbarProps} placement="layout" />
    ) : null;

  const toolbarDesktop = isLgUp ? <OverviewToolbar {...overviewToolbarProps} placement="page" /> : null;

  return (
    <div className="space-y-5 md:space-y-6">
      {toolbarMobileInLayout}
      {toolbarMobileUntilPortal}
      {toolbarDesktop}

      {/* New KPI grid (redesign Phase 2) — replaces the old KPIMetricsGrid */}
      <KpiGrid
        stats={dashboardStats}
        membership={membershipByPackageData}
        dateRange={dateRange}
        statsLoading={statsLoading}
        membershipLoading={membershipLoading}
      />

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

      {/* Revenue breakdown + advertising by platform (redesign Phase 4, row 3) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6">
        <RevenueBreakdownCard
          stats={dashboardStats}
          loading={statsLoading}
          dateRange={dateRange}
          startDate={customStartDate || undefined}
          endDate={customEndDate || undefined}
          onUserClick={openUserModal}
        />
        <AdvertisingPlatformCard stats={dashboardStats} loading={statsLoading} />
      </div>

      {/* Prize performance — ad spend & return by prize (redesign Phase 4, row 3b) */}
      <PrizePerformanceCard
        dateRange={dateRange}
        startDate={customStartDate || undefined}
        endDate={customEndDate || undefined}
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

      {/* Custom Date Range Modal */}
      <CustomDateRangeModal
        isOpen={isCustomDateModalOpen}
        onClose={() => setIsCustomDateModalOpen(false)}
        onApply={(startDate, endDate) => {
          updateDateFilter("custom", startDate, endDate);
        }}
        currentStartDate={customStartDate}
        currentEndDate={customEndDate}
        majorDraws={majorDraws}
      />
    </div>
  );
}
