"use client";

import { useMemo, useRef, useState, type ElementType, type ReactNode } from "react";
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
import { MetricCard, Popover, SegmentedBar, TrendPill, type Tone } from "@/components/admin/ui";
import { getPackageIcon, type PackageIconData } from "@/utils/images/package-icons";
import { tierColorByPackageId } from "./tierColors";
import AdSpendFocusModal from "@/components/modals/AdSpendFocusModal";
import { resolveAestDateWindow } from "@/utils/admin/resolveAestDateWindow";
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

type BreakdownRow = {
  id: string;
  label: string;
  color: string;
  value: number;
  icon?: PackageIconData;
  /** Overrides the default money formatting. Needed by any card whose breakdown is COUNTS —
   *  without it a row of "31 members" renders as "$31". */
  format?: (n: number) => string;
};

/** Plain count formatting for breakdown rows that are not money. */
const countFmt = (n: number) => n.toLocaleString("en-AU");

/**
 * A KPI tile that owns its own popover anchor + open state.
 * Renders a header (title + value + TrendPill) and a breakdown list.
 */
function KpiCard({
  title,
  value,
  valueAside,
  sub,
  footer,
  icon,
  tone,
  trend,
  invert = false,
  breakdown,
  loading = false,
}: {
  title: string;
  value: string;
  valueAside?: string;
  sub?: string;
  footer?: ReactNode;
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
        valueAside={valueAside}
        sub={sub}
        footer={footer}
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
                    {(row.format ?? moneyExact)(row.value)}
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
  startDate,
  endDate,
}: {
  stats: AdminDashboardStats | undefined;
  membership: MembershipByPackageData | undefined;
  dateRange: DateRange;
  rangeLabel?: string;
  statsLoading?: boolean;
  membershipLoading?: boolean;
  startDate?: string;
  endDate?: string;
}) {
  // Ad Spend / ROAS drill-down modal — resolves the page date filter to concrete
  // AEST yyyy-MM-dd bounds (same window as Facebook Ads → Spend by URL).
  const focusWindow = useMemo(
    () => resolveAestDateWindow(dateRange, startDate, endDate),
    [dateRange, startDate, endDate],
  );
  const [adSpendFocusOpen, setAdSpendFocusOpen] = useState(false);

  const users = stats?.users;
  const revenue = stats?.revenue;
  // All ad platforms combined — what the headline Ad Spend / ROAS KPIs render.
  // (`stats.facebookAds` is deliberately NOT read here: it is Meta-only and kept that
  // way for the Norm gateway; using it would understate company ad spend.)
  const adTotals = stats?.adTotals;
  const summary = membership?.summary;

  // Name the platforms actually contributing spend, so the headline figure is never
  // ambiguous about what it includes. Falls back to a generic label before data loads
  // or if a future channel appears that isn't in the map.
  const AD_CHANNEL_LABELS: Record<string, string> = {
    facebook: "Meta",
    tiktok: "TikTok",
    snapchat: "Snapchat",
    google: "Google",
  };
  const contributingPlatforms = Object.entries(stats?.attributedRevenue ?? {})
    .filter(([, v]) => (v?.adSpend ?? 0) > 0)
    .map(([k]) => AD_CHANNEL_LABELS[k === "meta" ? "facebook" : k] ?? null)
    .filter((v): v is string => v !== null);
  const adPlatformsSub =
    contributingPlatforms.length > 0
      ? `${contributingPlatforms.join(" + ")} ad spend`
      : "All ad platforms";

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
          // Shop was absent here while its money was already inside `revenue.total`, so
          // the card read "$181.90 from all sources" above six rows summing to $0.
          { id: "shop", label: "Shop", color: "#0ea5e9", value: breakdownRevenue(revenue.breakdown.shop) },
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
  // ONE cohort, three outcomes: the members whose renewal fell DUE in the selected range.
  // The card used to divide a payment-time numerator (succeededDistinctMembers) by a due-time
  // denominator, which described two different groups of people — Stripe finalises a renewal
  // invoice ~1h after the cycle boundary, so a late-night renewal is charged the next day.
  // succeededDistinctMembers is still shown, but in the popover, away from the fraction.
  const rp = users?.renewalProgress;
  const mr = users?.membershipRenewals;
  const cohort = mr?.renewalCohort;
  const renewalRate: number | null = rp?.rate ?? null;

  const renewalValue = (cohort?.landedInRange ?? 0).toLocaleString("en-AU");
  // The date tag sits once on the section header (see `rangeTag`), so the card says "due", not
  // "due today" — a custom range would otherwise read "due nov 2025 – present".
  const renewalAside =
    cohort && cohort.dueInRange > 0 ? `of ${cohort.dueInRange.toLocaleString("en-AU")} due` : undefined;

  // Remainder = due − landed − failed. Derived, NOT read from pendingInRange: dueInRange counts
  // every cycle status, so a status in neither numerator (e.g. `refunded`) belongs in the grey
  // segment rather than silently vanishing from the total.
  const renewalRemainder = cohort
    ? Math.max(0, cohort.dueInRange - cohort.landedInRange - cohort.failedInRange)
    : 0;
  const remainderLabel = cohort?.isOpen ? "to come" : "did not renew";

  const renewalSub =
    !cohort || cohort.dueInRange === 0
      ? "No renewals due"
      : cohort.collectionRate == null
        ? "None attempted yet"
        : `${cohort.collectionRate.toFixed(1)}% collected of those attempted`;

  const renewalFooter =
    cohort && cohort.dueInRange > 0 ? (
      <div className="space-y-1.5">
        <SegmentedBar
          total={cohort.dueInRange}
          label={`${cohort.landedInRange} landed, ${cohort.failedInRange} failed, ${renewalRemainder} ${remainderLabel}`}
          segments={[
            { key: "landed", value: cohort.landedInRange, className: "bg-emerald-500" },
            { key: "failed", value: cohort.failedInRange, className: "bg-red-500" },
          ]}
        />
        <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-2xs font-medium text-neutral-500 dark:text-neutral-400">
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-sm bg-emerald-500 shrink-0" />
            {cohort.landedInRange.toLocaleString("en-AU")} landed
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-sm bg-red-500 shrink-0" />
            {cohort.failedInRange.toLocaleString("en-AU")} failed
          </span>
          {/* Hidden at zero: on a settled past range every member has an outcome, and a
              standing "0 did not renew" implies a category that isn't doing any work. */}
          {renewalRemainder > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-sm bg-neutral-300 dark:bg-neutral-600 shrink-0" />
              {renewalRemainder.toLocaleString("en-AU")} {remainderLabel}
            </span>
          )}
        </div>
      </div>
    ) : undefined;

  // Popover rows are COUNTS, so each carries `format: countFmt` — the default is money.
  // "Payments received" is the old headline: it ties to the Revenue card's membershipRenewal
  // row, so it stays reachable, but it is a different cohort and must not sit beside the fraction.
  const renewalBreakdown: BreakdownRow[] = cohort
    ? [
        { id: "landed", label: "Landed", color: "#10b981", value: cohort.landedInRange, format: countFmt },
        { id: "failed", label: "Failed", color: "#ef4444", value: cohort.failedInRange, format: countFmt },
        ...(renewalRemainder > 0
          ? [
              {
                id: "remainder",
                label: cohort.isOpen ? "Still to come" : "Did not renew",
                color: "#a3a3a3",
                value: renewalRemainder,
                format: countFmt,
              },
            ]
          : []),
        {
          id: "payments",
          label: "Payments received in range",
          color: "#eab308",
          value: mr?.succeededDistinctMembers ?? 0,
          format: countFmt,
        },
        {
          id: "cycle",
          label: rp && rp.base > 0 ? `Billing cycle · ${renewalRate != null ? `${renewalRate.toFixed(1)}%` : "—"}` : "Billing cycle",
          color: "#6366f1",
          value: rp?.renewed ?? 0,
          format: (n) => (rp && rp.base > 0 ? `${countFmt(n)}/${countFmt(rp.base)}` : "—"),
        },
      ]
    : [];

  // ---- New-member ROAS (new-membership revenue ÷ ad spend) ----
  // Reuses the existing snapshot membership-new revenue + Facebook ad spend already on
  // `stats`. This is a NEW card only — it does NOT modify the Revenue-group Ad Spend /
  // ROAS cards (those stay untouched per request).
  const newMembershipRevenue = breakdownRevenue(revenue?.breakdown?.membershipPurchase);
  // All-platform spend, not Meta-only (2026-07-29). The numerator is new-membership
  // revenue from EVERY channel, so a Meta-only denominator inflated this figure — a
  // pre-existing mismatch that TikTok's live spend made materially wrong.
  const newMemberAdSpend = adTotals?.spend ?? 0;
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
            value={moneyWhole(Math.round(adTotals?.spend ?? 0))}
            sub={adPlatformsSub}
            icon={BarChart3}
            tone="blue"
            trend={trendPct(adTotals?.spendTrend)}
            loading={showStatsSkeleton}
            onClick={() => setAdSpendFocusOpen(true)}
            active={adSpendFocusOpen}
          />
          <MetricCard
            title="ROAS"
            value={`${(adTotals?.roas ?? 0).toFixed(2)}x`}
            sub="Platform-reported · all ads"
            icon={Target}
            tone="green"
            trend={trendPct(adTotals?.roasTrend)}
            loading={showStatsSkeleton}
            onClick={() => setAdSpendFocusOpen(true)}
            active={adSpendFocusOpen}
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
          <KpiCard
            title="Renewals"
            value={renewalValue}
            valueAside={renewalAside}
            sub={renewalSub}
            footer={renewalFooter}
            icon={RefreshCw}
            tone="emerald"
            breakdown={renewalBreakdown}
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

      <AdSpendFocusModal
        isOpen={adSpendFocusOpen}
        onClose={() => setAdSpendFocusOpen(false)}
        startDate={focusWindow.startDate}
        endDate={focusWindow.endDate}
        rangeLabel={rangeLabel}
      />
    </div>
  );
}
