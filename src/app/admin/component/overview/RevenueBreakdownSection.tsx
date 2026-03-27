"use client";

import React, { useState } from "react";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import DashboardSection from "./DashboardSection";
import RevenueDetailModal from "@/components/modals/RevenueDetailModal";
import { Package, RefreshCw, ShoppingCart, ShoppingBag, Trophy, TrendingUp } from "lucide-react";
import type { DateRange } from "@/components/admin/DateRangeToggle";
import type { RevenueCategory, RevenueBreakdownItem } from "@/hooks/queries/useAdminQueries";

interface RevenueBreakdownSectionProps {
  breakdown: {
    membershipPurchase: RevenueBreakdownItem;
    membershipRenewal: RevenueBreakdownItem;
    oneTimePurchase: RevenueBreakdownItem;
    additionalOneTimePurchase: RevenueBreakdownItem;
    miniDraw: RevenueBreakdownItem;
    upsell: RevenueBreakdownItem;
  };
  dateRange: DateRange;
  customStartDate?: string;
  customEndDate?: string;
  isExpanded: boolean;
  /** When false, section header is not collapsible (e.g. desktop always expanded) */
  collapsible?: boolean;
  onClose: () => void;
  onUserClick: (userId: string) => void;
}

export default function RevenueBreakdownSection({
  breakdown,
  dateRange,
  customStartDate,
  customEndDate,
  isExpanded,
  collapsible = true,
  onClose,
  onUserClick,
}: RevenueBreakdownSectionProps) {
  const [isRevenueDetailModalOpen, setIsRevenueDetailModalOpen] = useState(false);
  const [selectedRevenueCategory, setSelectedRevenueCategory] = useState<RevenueCategory | null>(null);

  const handleRevenueCardClick = (category: RevenueCategory) => {
    setSelectedRevenueCategory(category);
    setIsRevenueDetailModalOpen(true);
  };

  const handleCloseRevenueModal = () => {
    setIsRevenueDetailModalOpen(false);
    setSelectedRevenueCategory(null);
  };

  const getRevenueData = (breakdownValue: RevenueBreakdownItem | undefined) => {
    if (!breakdownValue) return { revenue: 0, purchaseCount: 0, userCount: 0, trend: undefined };
    if (typeof breakdownValue === "number") {
      return { revenue: breakdownValue, purchaseCount: 0, userCount: 0, trend: undefined };
    }
    return {
      revenue: breakdownValue.revenue,
      purchaseCount: breakdownValue.purchaseCount,
      userCount: breakdownValue.userCount,
      trend: breakdownValue.trend,
    };
  };

  if (!isExpanded) return null;

  return (
    <>
      <DashboardSection
        title="Revenue Breakdown"
        subtitle="Detailed breakdown by revenue source"
        collapsible={collapsible}
        isExpanded={isExpanded}
        onToggleExpand={onClose}
        noPadding={false}
        className="shadow-md"
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 sm:gap-3 lg:gap-4">
          <MetricCard
            title={
              <span className="block leading-tight text-[10px] sm:text-sm">
                <span className="block">Membership</span>
                <span className="block">New</span>
              </span>
            }
            value={`$${getRevenueData(breakdown.membershipPurchase).revenue.toLocaleString()}`}
            icon={Package}
            color="orange"
            valueClassName="text-sm sm:text-xl lg:text-lg xl:text-xl font-bold tabular-nums text-gray-900"
            className="hover:scale-[1.02] transition-transform"
            clickable={true}
            onClick={() => handleRevenueCardClick("membership-purchase")}
            count={getRevenueData(breakdown.membershipPurchase).purchaseCount}
            countLabel="subscriptions"
            trend={getRevenueData(breakdown.membershipPurchase).trend}
          />
          <MetricCard
            title={
              <span className="block leading-tight text-[10px] sm:text-sm">
                <span className="block">Membership</span>
                <span className="block">Renewal</span>
              </span>
            }
            value={`$${getRevenueData(breakdown.membershipRenewal).revenue.toLocaleString()}`}
            icon={RefreshCw}
            color="yellow"
            valueClassName="text-sm sm:text-xl lg:text-lg xl:text-xl font-bold tabular-nums text-gray-900"
            className="hover:scale-[1.02] transition-transform"
            clickable={true}
            onClick={() => handleRevenueCardClick("membership-renewal")}
            count={getRevenueData(breakdown.membershipRenewal).purchaseCount}
            countLabel="renewals"
            trend={getRevenueData(breakdown.membershipRenewal).trend}
          />
          <MetricCard
            title={
              <span className="block leading-tight text-[10px] sm:text-sm">
                <span className="block">One-Time</span>
                <span className="block">First</span>
              </span>
            }
            value={`$${getRevenueData(breakdown.oneTimePurchase).revenue.toLocaleString()}`}
            icon={ShoppingCart}
            color="blue"
            valueClassName="text-sm sm:text-xl lg:text-lg xl:text-xl font-bold tabular-nums text-gray-900"
            className="hover:scale-[1.02] transition-transform"
            clickable={true}
            onClick={() => handleRevenueCardClick("one-time-purchase")}
            count={getRevenueData(breakdown.oneTimePurchase).purchaseCount}
            countLabel="purchases"
            trend={getRevenueData(breakdown.oneTimePurchase).trend}
          />
          <MetricCard
            title={
              <span className="block leading-tight text-[10px] sm:text-sm">
                <span className="block">One-Time</span>
                <span className="block">Additional</span>
              </span>
            }
            value={`$${getRevenueData(breakdown.additionalOneTimePurchase).revenue.toLocaleString()}`}
            icon={ShoppingBag}
            color="indigo"
            valueClassName="text-sm sm:text-xl lg:text-lg xl:text-xl font-bold tabular-nums text-gray-900"
            className="hover:scale-[1.02] transition-transform"
            clickable={true}
            onClick={() => handleRevenueCardClick("additional-one-time")}
            count={getRevenueData(breakdown.additionalOneTimePurchase).purchaseCount}
            countLabel="purchases"
            trend={getRevenueData(breakdown.additionalOneTimePurchase).trend}
          />
          <MetricCard
            title={
              <span className="block leading-tight text-[10px] sm:text-sm">
                <span className="block">Mini</span>
                <span className="block">Draws</span>
              </span>
            }
            value={`$${getRevenueData(breakdown.miniDraw).revenue.toLocaleString()}`}
            icon={Trophy}
            color="purple"
            valueClassName="text-sm sm:text-xl lg:text-lg xl:text-xl font-bold tabular-nums text-gray-900"
            className="hover:scale-[1.02] transition-transform"
            clickable={true}
            onClick={() => handleRevenueCardClick("mini-draw")}
            count={getRevenueData(breakdown.miniDraw).purchaseCount}
            countLabel="purchases"
            trend={getRevenueData(breakdown.miniDraw).trend}
          />
          <MetricCard
            title="Upsells"
            value={`$${getRevenueData(breakdown.upsell).revenue.toLocaleString()}`}
            icon={TrendingUp}
            color="pink"
            valueClassName="text-sm sm:text-xl lg:text-lg xl:text-xl font-bold tabular-nums text-gray-900"
            className="hover:scale-[1.02] transition-transform"
            clickable={true}
            onClick={() => handleRevenueCardClick("upsell")}
            count={getRevenueData(breakdown.upsell).purchaseCount}
            countLabel="purchases"
            trend={getRevenueData(breakdown.upsell).trend}
          />
        </div>
      </DashboardSection>

      <RevenueDetailModal
        isOpen={isRevenueDetailModalOpen}
        onClose={handleCloseRevenueModal}
        category={selectedRevenueCategory}
        dateRange={dateRange}
        startDate={customStartDate}
        endDate={customEndDate}
        onUserClick={onUserClick}
      />
    </>
  );
}
