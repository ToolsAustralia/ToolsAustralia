"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { Card, SectionTitle, BarList, type BarItem } from "@/components/admin/ui";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import RevenueDetailModal from "@/components/modals/RevenueDetailModal";
import type { DateRange } from "@/components/admin/DateRangeToggle";
import type {
  AdminDashboardStats,
  RevenueBreakdownItem,
  RevenueCategory,
} from "@/hooks/queries/useAdminQueries";

/**
 * Revenue breakdown bar list for the admin Overview.
 *
 * Replaces the legacy `RevenueBreakdownSection` (6-up `MetricCard` grid + detail
 * modal) with a compact 6-row `BarList`. Each `stats.revenue.breakdown` source is
 * normalised the same way the old section did (`number | { revenue, purchaseCount,
 * userCount, trend? }`) — `value` is the revenue, `count`/`unit` annotate the bar.
 * Pure presentation over the `useAdminDashboardStats` result passed down from
 * `DashboardOverview`. The detail modal is intentionally dropped in the redesign.
 */
function normalize(item: RevenueBreakdownItem | undefined): {
  revenue: number;
  purchaseCount: number;
} {
  if (!item) return { revenue: 0, purchaseCount: 0 };
  if (typeof item === "number") return { revenue: item, purchaseCount: 0 };
  return { revenue: item.revenue, purchaseCount: item.purchaseCount };
}

export default function RevenueBreakdownCard({
  stats,
  loading = false,
  dateRange,
  startDate,
  endDate,
  onUserClick,
}: {
  stats: AdminDashboardStats | undefined;
  loading?: boolean;
  dateRange: DateRange;
  startDate?: string;
  endDate?: string;
  onUserClick?: (userId: string) => void;
}) {
  const { fmtCompact, formatNumber } = useMetricsFormatting();

  // Detail-modal state — clicking a bar row opens the revenue detail modal scoped to
  // that source (legacy `RevenueBreakdownSection` UX). `id` doubles as the RevenueCategory.
  const [selectedCategory, setSelectedCategory] = useState<RevenueCategory | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Only skeleton when there is no data yet — a background refetch keeps the bars.
  const showSkeleton = loading && !stats;

  const breakdown = stats?.revenue.breakdown;

  // Same source → (label, color, unit) mapping as the legacy section. `id` is the
  // `RevenueCategory` the detail modal expects, so a bar click forwards it directly.
  const sources: {
    id: RevenueCategory;
    label: string;
    color: string;
    unit: string;
    item: RevenueBreakdownItem | undefined;
  }[] = [
    {
      id: "membership-purchase",
      label: "Membership New",
      color: "#f97316",
      unit: "subscriptions",
      item: breakdown?.membershipPurchase,
    },
    {
      id: "membership-renewal",
      label: "Membership Renewal",
      color: "#eab308",
      unit: "renewals",
      item: breakdown?.membershipRenewal,
    },
    {
      id: "one-time-purchase",
      label: "One-Time First",
      color: "#3b82f6",
      unit: "purchases",
      item: breakdown?.oneTimePurchase,
    },
    {
      id: "additional-one-time",
      label: "One-Time Add'l",
      color: "#6366f1",
      unit: "purchases",
      item: breakdown?.additionalOneTimePurchase,
    },
    {
      id: "mini-draw",
      label: "Mini Draws",
      color: "#a855f7",
      unit: "entries",
      item: breakdown?.miniDraw,
    },
    {
      id: "upsell",
      label: "Upsells",
      color: "#ec4899",
      unit: "purchases",
      item: breakdown?.upsell,
    },
  ];

  const items: BarItem[] = sources.map((s) => {
    const { revenue, purchaseCount } = normalize(s.item);
    return {
      id: s.id,
      label: s.label,
      value: revenue,
      color: s.color,
      count: purchaseCount,
      unit: s.unit,
    };
  });

  const total = items.reduce((sum, it) => sum + it.value, 0);

  return (
    <Card className="p-5 h-full min-w-0">
      <SectionTitle
        title="Revenue breakdown"
        subtitle={showSkeleton ? "Loading…" : `${fmtCompact(total)} across 6 sources`}
        icon={BarChart3}
      />
      {showSkeleton ? (
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="h-3 w-28 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
                <span className="h-3 w-12 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse shrink-0" />
              </div>
              <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <BarList
          items={items}
          fmt={fmtCompact}
          fmtCount={formatNumber}
          equalLength
          onItemClick={(id) => {
            setSelectedCategory(id as RevenueCategory);
            setModalOpen(true);
          }}
        />
      )}

      <RevenueDetailModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedCategory(null);
        }}
        category={selectedCategory}
        dateRange={dateRange}
        startDate={startDate}
        endDate={endDate}
        onUserClick={onUserClick}
      />
    </Card>
  );
}
