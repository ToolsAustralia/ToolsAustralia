"use client";

import { useRef, useState, type ElementType } from "react";
import {
  DollarSign,
  TrendingUp,
  BarChart3,
  Target,
  Users,
  UserCheck,
  UserX,
  RefreshCw,
} from "lucide-react";
import Image from "next/image";
import { MetricCard, Popover, TrendPill, type Tone } from "@/components/admin/ui";
import { getPackageIcon, type PackageIconData } from "@/utils/images/package-icons";
import { tierColorByPackageId } from "./tierColors";
import type { DateRange } from "@/components/admin/DateRangeToggle";
import type { TrendData } from "@/types/admin/trend-types";
import type {
  AdminDashboardStats,
  MembershipByPackageData,
  RevenueBreakdownItem,
} from "@/hooks/queries/useAdminQueries";

/**
 * Convert the existing `{ value, direction }` TrendData into the signed numeric
 * percentage the kit's `TrendPill` expects (positive = up, negative = down).
 * Returns `null` when there is no trend (e.g. all-time), which hides the pill.
 *
 * `TrendData.value` from `TrendCalculationService` is ALREADY signed (negative for
 * a decrease), so we return it verbatim. The previous implementation re-applied the
 * sign from `direction` (`direction === "down" ? -value : value`), which
 * double-negated every decrease into a positive — that's why a day with lower
 * revenue than yesterday rendered as a green ↑. Do NOT re-introduce that.
 *
 * When there is no prior-period baseline (`previousValue === 0`, where
 * `calculateTrend` force-returns +100/up) a "% change" is undefined, so we hide the
 * pill rather than show a misleading +100% growth.
 */
function trendPct(trend: TrendData | undefined): number | null {
  if (!trend) return null;
  if (trend.previousValue === 0) return null;
  return trend.value;
}

/** Normalize a revenue breakdown entry (number OR object) like the old code does. */
function breakdownRevenue(item: RevenueBreakdownItem | undefined): number {
  if (!item) return 0;
  if (typeof item === "number") return item;
  return item.revenue;
}

const moneyWhole = (n: number) => `$${n.toLocaleString("en-AU")}`;
/** Exact AUD — full value, thousands separators, no k/M compacting, decimals only if present. */
const moneyExact = (n: number) => `$${n.toLocaleString("en-AU", { maximumFractionDigits: 2 })}`;

type BreakdownRow = { id: string; label: string; color: string; value: number; icon?: PackageIconData };

/**
 * A KPI tile that owns its own popover anchor + open state.
 * Renders a header (title + value + TrendPill) and a breakdown list.
 */
function KpiCard({
  title,
  value,
  sub,
  icon,
  tone,
  trend,
  invert = false,
  breakdown,
  loading = false,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: ElementType;
  tone: Tone;
  trend?: number | null;
  invert?: boolean;
  breakdown: BreakdownRow[];
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} className="min-w-0">
      <MetricCard
        title={title}
        value={value}
        sub={sub}
        icon={icon}
        tone={tone}
        trend={trend}
        invert={invert}
        loading={loading}
        onClick={() => setOpen((o) => !o)}
        active={open}
      />
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} width={300} align="end">
        <div className="p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p className="text-2xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 truncate">
                {title}
              </p>
              <p className="font-display font-extrabold text-xl leading-none text-neutral-900 dark:text-white num mt-1">
                {value}
              </p>
            </div>
            {trend != null && <TrendPill value={trend} invert={invert} />}
          </div>
          <div className="space-y-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
            {breakdown.length === 0 ? (
              <p className="text-2xs text-neutral-400 dark:text-neutral-500">No breakdown available</p>
            ) : (
              breakdown.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    {row.icon ? (
                      <span className="w-5 h-5 shrink-0 flex items-center justify-center">
                        <Image src={row.icon} alt="" className="w-full h-full object-contain" />
                      </span>
                    ) : (
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: row.color }}
                      />
                    )}
                    <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">
                      {row.label}
                    </span>
                  </span>
                  <span className="text-xs font-bold text-neutral-900 dark:text-white num shrink-0">
                    {moneyExact(row.value)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </Popover>
    </div>
  );
}

export default function KpiGrid({
  stats,
  membership,
  dateRange,
  rangeLabel = "",
  statsLoading = false,
  membershipLoading = false,
}: {
  stats: AdminDashboardStats | undefined;
  membership: MembershipByPackageData | undefined;
  dateRange: DateRange;
  rangeLabel?: string;
  statsLoading?: boolean;
  membershipLoading?: boolean;
}) {
  const users = stats?.users;
  const revenue = stats?.revenue;
  const facebookAds = stats?.facebookAds;
  const summary = membership?.summary;

  // Only show skeletons when there is no data yet — a background refetch with
  // cached data should keep showing the cached values, not flash placeholders.
  const showStatsSkeleton = statsLoading && !stats;
  const showMembershipSkeleton = membershipLoading && !membership;

  // Date tag (e.g. " (Today)" / " (Nov 2025 – present)") for the selected filter.
  // Rendered ONCE on each KPI section header ("Revenue (Today)", "Users & Performance
  // (Today)") rather than on every card, to keep the cards themselves clean.
  const rangeTag = rangeLabel ? ` (${rangeLabel})` : "";

  // ---- Revenue tile (clickable) ----
  const revenueTitle = "Revenue";

  const revenueBreakdown: BreakdownRow[] = revenue
    ? (
        [
          { id: "membershipPurchase", label: "Membership New", color: "#f97316", value: breakdownRevenue(revenue.breakdown.membershipPurchase) },
          { id: "membershipRenewal", label: "Membership Renewal", color: "#eab308", value: breakdownRevenue(revenue.breakdown.membershipRenewal) },
          { id: "oneTimePurchase", label: "One-Time First", color: "#3b82f6", value: breakdownRevenue(revenue.breakdown.oneTimePurchase) },
          { id: "additionalOneTimePurchase", label: "One-Time Add'l", color: "#6366f1", value: breakdownRevenue(revenue.breakdown.additionalOneTimePurchase) },
          { id: "miniDraw", label: "Mini Draws", color: "#a855f7", value: breakdownRevenue(revenue.breakdown.miniDraw) },
          { id: "upsell", label: "Upsells", color: "#ec4899", value: breakdownRevenue(revenue.breakdown.upsell) },
        ] as BreakdownRow[]
      ).sort((a, b) => b.value - a.value)
    : [];

  // ---- Membership Revenue tile (clickable) ----
  const membershipSub = summary
    ? `${(summary.totalActiveCount ?? 0).toLocaleString("en-AU")} active${
        (summary.totalPastDueCount ?? 0) > 0
          ? ` · ${(summary.totalPastDueCount ?? 0).toLocaleString("en-AU")} past due`
          : ""
      }`
    : undefined;

  const membershipBreakdown: BreakdownRow[] = (membership?.packages ?? []).map((pkg) => ({
    id: pkg.packageId,
    label: pkg.packageName,
    color: tierColorByPackageId(pkg.packageId),
    value: pkg.activeRevenue,
    icon: getPackageIcon(pkg.packageId) ?? undefined,
  }));

  // ---- Cancellations sub ----
  const cancellationSub = `$${(users?.cancellationImpact?.estimatedMonthlyRevenue ?? 0).toLocaleString(
    "en-AU",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  )} at risk${dateRange === "all-time" ? " (scheduled)" : ""}`;

  // ---- Renewals ----
  // Headline = renewals in the SELECTED range (filter-driven) — renewed + past due.
  // Sub = current billing-cycle progress (cycle-anchored, filter-independent).
  const rp = users?.renewalProgress;
  const mr = users?.membershipRenewals;
  const renewalRate: number | null = rp?.rate ?? null;
  // Only the renewed count is the big headline number; the "renewed · N past due"
  // words ride along as small muted aside text so they don't dominate the tile.
  const renewalValue = (mr?.succeededDistinctMembers ?? 0).toLocaleString("en-AU");
  const renewalAside = `renewed · ${(mr?.becamePastDueInRange ?? 0).toLocaleString("en-AU")} past due`;
  const renewalSub =
    rp && rp.base > 0
      ? `Cycle: ${renewalRate != null ? `${renewalRate.toFixed(1)}%` : "—"} · ${rp.renewed.toLocaleString("en-AU")}/${rp.base.toLocaleString("en-AU")}`
      : renewalRate != null
        ? `Cycle: ${renewalRate.toFixed(1)}%`
        : "No active cycle";

  // ---- New-member ROAS (new-membership revenue ÷ ad spend) ----
  // Reuses the existing snapshot membership-new revenue + Facebook ad spend already on
  // `stats`. This is a NEW card only — it does NOT modify the Revenue-group Ad Spend /
  // ROAS cards (those stay untouched per request).
  const newMembershipRevenue = breakdownRevenue(revenue?.breakdown?.membershipPurchase);
  const newMemberAdSpend = facebookAds?.spend ?? 0;
  const newMemberRoas = newMemberAdSpend > 0 ? newMembershipRevenue / newMemberAdSpend : null;

  return (
    <div className="space-y-5">
      {/* Revenue group */}
      <div>
        <p className="text-2xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2.5">
          {`Revenue${rangeTag}`}
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            title={revenueTitle}
            value={moneyWhole(revenue?.total ?? 0)}
            sub="From all sources"
            icon={DollarSign}
            tone="emerald"
            trend={trendPct(revenue?.totalTrend)}
            breakdown={revenueBreakdown}
            loading={showStatsSkeleton}
          />
          <MetricCard
            title="Ad Spend"
            value={moneyWhole(Math.round(facebookAds?.spend ?? 0))}
            sub="Facebook Ads spend"
            icon={BarChart3}
            tone="blue"
            trend={trendPct(facebookAds?.spendTrend)}
            loading={showStatsSkeleton}
          />
          <MetricCard
            title="ROAS"
            value={`${(facebookAds?.roas ?? 0).toFixed(2)}x`}
            sub="Return on ad spend"
            icon={Target}
            tone="green"
            trend={trendPct(facebookAds?.roasTrend)}
            loading={showStatsSkeleton}
          />
          <KpiCard
            title="MRR"
            value={moneyWhole(Math.round(summary?.totalActiveRevenue ?? 0))}
            sub={membershipSub}
            icon={TrendingUp}
            tone="red"
            trend={trendPct(summary?.totalActiveRevenueTrend)}
            breakdown={membershipBreakdown}
            loading={showMembershipSkeleton}
          />
        </div>
      </div>

      {/* Users & Performance group */}
      <div>
        <p className="text-2xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2.5">
          {`Users & Performance${rangeTag}`}
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Total Users ≈ total signups, so all-time shows Total Users; any other
              range shows that period's signups with total users as subtext. */}
          {dateRange === "all-time" ? (
            <MetricCard
              title="Total Users"
              value={(users?.total ?? 0).toLocaleString("en-AU")}
              sub="Active users (all-time)"
              icon={Users}
              tone="indigo"
              loading={showStatsSkeleton}
            />
          ) : (
            <MetricCard
              title="New Signups"
              value={(users?.newInRange ?? 0).toLocaleString("en-AU")}
              sub={`${(users?.total ?? 0).toLocaleString("en-AU")} total users`}
              icon={UserCheck}
              tone="blue"
              trend={trendPct(users?.newInRangeTrend)}
              loading={showStatsSkeleton}
            />
          )}
          <MetricCard
            title="Conversion Rate"
            value={`${(stats?.conversionRate ?? 0).toFixed(1)}%`}
            sub="Paying customers"
            icon={Target}
            tone="violet"
            trend={trendPct(stats?.conversionRateTrend)}
            loading={showStatsSkeleton}
          />
          <MetricCard
            title="New-Member ROAS"
            value={newMemberRoas != null ? `${newMemberRoas.toFixed(2)}x` : "—"}
            sub="New membership rev ÷ ad spend"
            icon={TrendingUp}
            tone="indigo"
            loading={showStatsSkeleton}
          />
          <MetricCard
            title="Renewals"
            value={renewalValue}
            valueAside={renewalAside}
            sub={renewalSub}
            icon={RefreshCw}
            tone="emerald"
            loading={showStatsSkeleton}
          />
          <MetricCard
            title="Cancellations"
            value={(users?.cancelledMemberships ?? 0).toLocaleString("en-AU")}
            sub={cancellationSub}
            icon={UserX}
            tone="red"
            trend={trendPct(users?.cancelledMembershipsTrend)}
            invert
            loading={showStatsSkeleton}
          />
        </div>
      </div>
    </div>
  );
}
