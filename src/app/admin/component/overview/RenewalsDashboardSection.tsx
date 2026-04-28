"use client";

import React, { useMemo, useState } from "react";
import DashboardSection from "./DashboardSection";
import UpcomingRenewalsSchedulePanel from "./UpcomingRenewalsSection";
import MembershipRenewalPeriodStats from "./MembershipRenewalPeriodStats";
import { useUpcomingRenewals } from "@/hooks/queries/useAdminQueries";
import type { UpcomingRenewalsRange } from "@/hooks/queries/useAdminQueries";
import type { MembershipRenewalsSummary } from "./MembershipRenewalPeriodStats";

type RenewalsTab = "upcoming" | "period";

const UPCOMING_RENEWALS_PAGE_SIZE = 15;

interface RenewalsDashboardSectionProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
  membershipRenewals?: MembershipRenewalsSummary;
  statsLoading?: boolean;
}

export default function RenewalsDashboardSection({
  isExpanded,
  onToggleExpand,
  membershipRenewals,
  statsLoading = false,
}: RenewalsDashboardSectionProps) {
  const [tab, setTab] = useState<RenewalsTab>("upcoming");
  const [upcomingRenewalsRange, setUpcomingRenewalsRange] = useState<UpcomingRenewalsRange>(0);
  const [upcomingRenewalsPage, setUpcomingRenewalsPage] = useState(1);

  const { data: upcomingRenewalsData, isLoading: upcomingRenewalsLoading } = useUpcomingRenewals(
    upcomingRenewalsRange,
    upcomingRenewalsPage,
    UPCOMING_RENEWALS_PAGE_SIZE
  );

  const sectionSubtitle = useMemo(() => {
    if (tab === "period") {
      if (statsLoading) return "Loading metrics for the selected dashboard period…";
      if (membershipRenewals) {
        let s = `Due ${membershipRenewals.expectedInRange.toLocaleString()} · Paid ${membershipRenewals.succeededInRange.toLocaleString()}`;
        if (membershipRenewals.becamePastDueInRange > 0) {
          s += ` · New past due ${membershipRenewals.becamePastDueInRange.toLocaleString()}`;
        }
        return s;
      }
      return "Renewal counts for the dashboard date range";
    }
    if (upcomingRenewalsData && !upcomingRenewalsLoading) {
      return `${upcomingRenewalsData.total} renewals · $${(upcomingRenewalsData.totalRevenue ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} expected (this window)`;
    }
    return undefined;
  }, [tab, upcomingRenewalsData, upcomingRenewalsLoading, membershipRenewals, statsLoading]);

  return (
    <DashboardSection
      title="Membership renewals"
      subtitle={sectionSubtitle}
      collapsible={true}
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      noPadding={false}
      className="shadow-md"
    >
      <div
        className="flex flex-wrap gap-1 mb-3"
        role="tablist"
        aria-label="Renewals view"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "upcoming"}
          id="renewals-tab-upcoming"
          aria-controls="renewals-panel-upcoming"
          onClick={() => setTab("upcoming")}
          className={`px-2.5 py-1.5 rounded-md text-[10px] sm:text-xs font-semibold transition-all ${
            tab === "upcoming"
              ? "bg-emerald-600 text-white shadow-sm"
              : "bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-600 text-gray-600 dark:text-neutral-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
          }`}
        >
          Upcoming schedule
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "period"}
          id="renewals-tab-period"
          aria-controls="renewals-panel-period"
          onClick={() => setTab("period")}
          className={`px-2.5 py-1.5 rounded-md text-[10px] sm:text-xs font-semibold transition-all ${
            tab === "period"
              ? "bg-emerald-600 text-white shadow-sm"
              : "bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-600 text-gray-600 dark:text-neutral-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
          }`}
        >
          Period performance
        </button>
      </div>

      <div
        role="tabpanel"
        id="renewals-panel-upcoming"
        aria-labelledby="renewals-tab-upcoming"
        hidden={tab !== "upcoming"}
      >
        <UpcomingRenewalsSchedulePanel
          upcomingRenewalsRange={upcomingRenewalsRange}
          onRangeChange={(days) => {
            setUpcomingRenewalsRange(days);
            setUpcomingRenewalsPage(1);
          }}
          upcomingRenewalsPage={upcomingRenewalsPage}
          onPageChange={setUpcomingRenewalsPage}
          upcomingRenewalsData={upcomingRenewalsData}
          upcomingRenewalsLoading={upcomingRenewalsLoading}
          pageSize={UPCOMING_RENEWALS_PAGE_SIZE}
        />
      </div>

      <div
        role="tabpanel"
        id="renewals-panel-period"
        aria-labelledby="renewals-tab-period"
        hidden={tab !== "period"}
      >
        <MembershipRenewalPeriodStats membershipRenewals={membershipRenewals} statsLoading={statsLoading} />
      </div>
    </DashboardSection>
  );
}
