"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { format } from "date-fns";
import OverviewToolbar from "./OverviewToolbar";
import KPIMetricsGrid from "./KPIMetricsGrid";
import RevenueBreakdownSection from "./RevenueBreakdownSection";
import MembershipBreakdownSection from "./MembershipBreakdownSection";
import UpcomingRenewalsSection from "./UpcomingRenewalsSection";
import AdvertisingBreakdownSection from "@/app/admin/component/overview/AdvertisingBreakdownSection";
import RevenueOverview from "@/components/admin/RevenueOverview";
import QuickActionsPanel from "./QuickActionsPanel";
import RecentActivityFeed from "./RecentActivityFeed";
import CustomDateRangeModal from "@/components/admin/CustomDateRangeModal";
import { DateRange } from "@/components/admin/DateRangeToggle";
import {
  useAdminDashboardStats,
  useCurrentAndLastDrawDates,
  useMajorDrawsForDateRange,
  useMembershipByPackage,
} from "@/hooks/queries/useAdminQueries";
import { useAdminUserModal } from "@/contexts/AdminUserModalContext";
import { useAdminMobileDateToolbarSlot } from "@/hooks/useAdminMobileDateToolbarSlot";

export default function DashboardOverview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { openUserModal } = useAdminUserModal();

  // Date filter state
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);

  // Section expand/collapse state — mobile starts collapsed; desktop always shows breakdowns via isLgUp || …
  const [isRevenueBreakdownExpanded, setIsRevenueBreakdownExpanded] = useState(false);
  const [isMembershipByPackageExpanded, setIsMembershipByPackageExpanded] = useState(false);
  const [isUpcomingRenewalsExpanded, setIsUpcomingRenewalsExpanded] = useState(false);
  const [isAdvertisingBreakdownExpanded, setIsAdvertisingBreakdownExpanded] = useState(true);
  const [isUsersPerformanceExpanded, setIsUsersPerformanceExpanded] = useState(true);

  const { isLgUp, slotEl: mobileToolbarRoot } = useAdminMobileDateToolbarSlot();

  /** Desktop (lg+): always show revenue + membership breakdown; mobile uses stored toggle */
  const revenueBreakdownShown = isLgUp || isRevenueBreakdownExpanded;
  const membershipBreakdownShown = isLgUp || isMembershipByPackageExpanded;

  /** Collapsing the Revenue group also collapses Membership + Upcoming Renewals (same chevron) */
  const collapseRevenueGroup = () => {
    setIsRevenueBreakdownExpanded(false);
    setIsMembershipByPackageExpanded(false);
    setIsUpcomingRenewalsExpanded(false);
  };

  const handleRevenueExpandToggle = () => {
    setIsRevenueBreakdownExpanded((prev) => {
      const next = !prev;
      if (!next) {
        setIsMembershipByPackageExpanded(false);
        setIsUpcomingRenewalsExpanded(false);
      } else {
        // Re-expanding the Revenue group should show membership breakdown again
        setIsMembershipByPackageExpanded(true);
      }
      return next;
    });
  };

  const handleRevenueBreakdownCardToggle = () => {
    setIsRevenueBreakdownExpanded((prev) => {
      const next = !prev;
      if (!next) {
        setIsMembershipByPackageExpanded(false);
        setIsUpcomingRenewalsExpanded(false);
      } else {
        setIsMembershipByPackageExpanded(true);
      }
      return next;
    });
  };

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
    error: statsError,
    refetch: refetchStats,
  } = useAdminDashboardStats(
    dateRange,
    customStartDate ? customStartDate : undefined,
    customEndDate ? customEndDate : undefined
  );

  // Fetch membership data for the KPI card
  const { data: membershipByPackageData, isLoading: membershipLoading } = useMembershipByPackage();

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
    <div className="space-y-6">
      {toolbarMobileInLayout}
      {toolbarMobileUntilPortal}
      {toolbarDesktop}

      {/* KPI Metrics with integrated breakdown sections */}
      <KPIMetricsGrid
        dashboardStats={dashboardStats}
        membershipSummary={membershipByPackageData?.summary}
        dateRange={dateRange}
        loading={statsLoading}
        error={statsError}
        onRevenueClick={handleRevenueBreakdownCardToggle}
        onMembershipClick={() => setIsMembershipByPackageExpanded(!isMembershipByPackageExpanded)}
        membershipLoading={membershipLoading}
        isRevenueExpanded={isRevenueBreakdownExpanded}
        onRevenueExpandToggle={handleRevenueExpandToggle}
        isAdvertisingExpanded={isAdvertisingBreakdownExpanded}
        onAdvertisingExpandToggle={() => setIsAdvertisingBreakdownExpanded(!isAdvertisingBreakdownExpanded)}
        isUsersPerformanceExpanded={isUsersPerformanceExpanded}
        onUsersPerformanceExpandToggle={() => setIsUsersPerformanceExpanded(!isUsersPerformanceExpanded)}
        revenueBreakdownSection={
          dashboardStats ? (
            <RevenueBreakdownSection
              breakdown={dashboardStats.revenue.breakdown}
              dateRange={dateRange}
              customStartDate={customStartDate || undefined}
              customEndDate={customEndDate || undefined}
              isExpanded={revenueBreakdownShown}
              collapsible={!isLgUp}
              onClose={collapseRevenueGroup}
              onUserClick={openUserModal}
            />
          ) : null
        }
        membershipBreakdownSection={
          <MembershipBreakdownSection
            isExpanded={membershipBreakdownShown}
            collapsible={!isLgUp}
            onClose={() => setIsMembershipByPackageExpanded(false)}
            onUserClick={openUserModal}
          />
        }
        upcomingRenewalsSection={
          <UpcomingRenewalsSection
            isExpanded={isUpcomingRenewalsExpanded}
            onToggleExpand={() => setIsUpcomingRenewalsExpanded(!isUpcomingRenewalsExpanded)}
          />
        }
        advertisingBreakdownSection={
          <AdvertisingBreakdownSection
            dateRange={dateRange}
            customStartDate={customStartDate || undefined}
            customEndDate={customEndDate || undefined}
            isExpanded={isAdvertisingBreakdownExpanded}
          />
        }
      />

      {/* Revenue Overview Chart */}
      <RevenueOverview />

      {/* Quick Actions */}
      <QuickActionsPanel onRefreshStats={() => refetchStats()} />

      {/* Recent Activity Feed */}
      <RecentActivityFeed />

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
