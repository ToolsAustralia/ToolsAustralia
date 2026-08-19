import type { AdminDashboardStats } from "@/hooks/queries/useAdminQueries";

/**
 * Period-comparison model — the metric rows the Overview card and its drawer both render.
 *
 * PURE and unit-tested. Everything here is derived from the EXISTING `useAdminDashboardStats`
 * payload; this module introduces no new revenue truth, it only re-presents numbers the
 * dashboard already computes. That is deliberate: a second aggregation of "revenue" is exactly
 * how two admin surfaces end up disagreeing.
 */

/** How a metric should be rendered, and which direction is good. */
export type MetricFormat = "currency" | "count" | "ratio";

export interface ComparisonMetric {
  key: string;
  label: string;
  format: MetricFormat;
  /** Shown in the card (the headline set) as well as the drawer. */
  headline: boolean;
  /** Section heading in the drawer. */
  group: "Revenue" | "Customers" | "Advertising";
  current: number;
  previous: number;
  /** current − previous. */
  delta: number;
  /**
   * Percentage change, or null when the previous value is 0 — a change from nothing has no
   * meaningful percentage, and rendering ∞ or a flat 100% would read as a real measurement.
   */
  deltaPct: number | null;
}

/**
 * `RevenueBreakdownItem` is a legacy union: older payloads carry a bare number, newer ones an
 * object. Both shapes are live, so every read goes through these two helpers rather than
 * assuming one — the object form is what carries `purchaseCount`, which the count metrics need.
 */
type BreakdownItem = AdminDashboardStats["revenue"]["breakdown"]["membershipPurchase"];

function itemRevenue(item: BreakdownItem | undefined): number {
  if (item == null) return 0;
  return typeof item === "number" ? item : (item.revenue ?? 0);
}

function itemCount(item: BreakdownItem | undefined): number {
  if (item == null || typeof item === "number") return 0;
  return item.purchaseCount ?? 0;
}

/** The five acquisition buckets, in the same order the Advertising card uses. */
const ACQUISITION_KEYS = [
  "membershipPurchase",
  "oneTimePurchase",
  "additionalOneTimePurchase",
  "miniDraw",
  "upsell",
] as const;

function totalPurchases(stats: AdminDashboardStats | undefined): number {
  if (!stats) return 0;
  return ACQUISITION_KEYS.reduce((t, k) => t + itemCount(stats.revenue.breakdown[k]), 0);
}

/**
 * Acquisition revenue — the five acquisition buckets, RENEWALS EXCLUDED.
 *
 * Deliberately not `revenue.total`, which includes `membershipRenewal`. Ad spend only buys
 * acquisition, so `revenue.total − adSpend` would credit the ad budget with renewal income it
 * did not produce and flatter the number. This matches the Advertising Analytics Suite master
 * spec §2 ("acquisition-only for ALL ROAS/contribution numbers").
 */
function acquisitionRevenue(stats: AdminDashboardStats | undefined): number {
  if (!stats) return 0;
  return ACQUISITION_KEYS.reduce((t, k) => t + itemRevenue(stats.revenue.breakdown[k]), 0);
}

/**
 * Build the comparison rows from two stats payloads.
 *
 * A missing payload (still loading, or the comparison window errored) contributes zeros rather
 * than throwing, so the card degrades to "no movement" instead of blanking the dashboard.
 */
export function buildPeriodComparison(
  current: AdminDashboardStats | undefined,
  previous: AdminDashboardStats | undefined,
): ComparisonMetric[] {
  const spec: Array<{
    key: string;
    label: string;
    format: MetricFormat;
    headline: boolean;
    group: ComparisonMetric["group"];
    read: (s: AdminDashboardStats | undefined) => number;
  }> = [
    // ── Revenue ──────────────────────────────────────────────────────────────────────────
    {
      key: "revenueTotal",
      label: "Total revenue",
      format: "currency",
      headline: true,
      group: "Revenue",
      read: (s) => s?.revenue.total ?? 0,
    },
    {
      key: "revenueMembershipPurchase",
      label: "New membership revenue",
      format: "currency",
      headline: false,
      group: "Revenue",
      read: (s) => itemRevenue(s?.revenue.breakdown.membershipPurchase),
    },
    {
      key: "revenueMembershipRenewal",
      label: "Renewal revenue",
      format: "currency",
      headline: false,
      group: "Revenue",
      read: (s) => itemRevenue(s?.revenue.breakdown.membershipRenewal),
    },
    {
      key: "revenueOneTime",
      label: "One-time revenue",
      format: "currency",
      headline: false,
      group: "Revenue",
      read: (s) => itemRevenue(s?.revenue.breakdown.oneTimePurchase),
    },
    {
      key: "revenueAdditionalOneTime",
      label: "Additional one-time revenue",
      format: "currency",
      headline: false,
      group: "Revenue",
      read: (s) => itemRevenue(s?.revenue.breakdown.additionalOneTimePurchase),
    },
    {
      key: "revenueMiniDraw",
      label: "Mini-draw revenue",
      format: "currency",
      headline: false,
      group: "Revenue",
      read: (s) => itemRevenue(s?.revenue.breakdown.miniDraw),
    },
    {
      key: "revenueUpsell",
      label: "Upsell revenue",
      format: "currency",
      headline: false,
      group: "Revenue",
      read: (s) => itemRevenue(s?.revenue.breakdown.upsell),
    },

    // ── Customers ────────────────────────────────────────────────────────────────────────
    {
      key: "newMemberships",
      label: "New memberships",
      format: "count",
      headline: true,
      group: "Customers",
      read: (s) => itemCount(s?.revenue.breakdown.membershipPurchase),
    },
    {
      key: "purchases",
      label: "Purchases",
      format: "count",
      headline: true,
      group: "Customers",
      read: totalPurchases,
    },
    {
      key: "newUsers",
      label: "New accounts",
      format: "count",
      headline: true,
      group: "Customers",
      read: (s) => s?.users.newInRange ?? 0,
    },
    {
      key: "activeSubscriptions",
      label: "Active memberships",
      format: "count",
      headline: false,
      group: "Customers",
      read: (s) => s?.users.activeSubscriptions ?? 0,
    },
    {
      key: "cancelledMemberships",
      label: "Cancellations",
      format: "count",
      headline: false,
      group: "Customers",
      read: (s) => s?.users.cancelledMemberships ?? 0,
    },

    // ── Advertising ──────────────────────────────────────────────────────────────────────
    {
      key: "adSpend",
      label: "Ad spend",
      format: "currency",
      headline: true,
      group: "Advertising",
      read: (s) => s?.adTotals?.spend ?? 0,
    },
    {
      key: "adRoas",
      label: "ROAS",
      format: "ratio",
      headline: true,
      group: "Advertising",
      read: (s) => s?.adTotals?.roas ?? 0,
    },
    {
      key: "acquisitionRevenue",
      label: "Acquisition revenue",
      format: "currency",
      headline: false,
      group: "Advertising",
      read: acquisitionRevenue,
    },
    {
      /**
       * Contribution after ad spend — acquisition revenue minus ad spend.
       *
       * Labelled as the subtraction it is, NEVER as "Profit": COGS, fees and returns are not
       * subtracted (master spec §2). Uses ACQUISITION revenue, not `revenue.total` — ad spend
       * only buys acquisition, so including renewals would credit the budget with income it
       * did not produce.
       *
       * Legitimately negative in a month where spend outran acquisition; the UI must render
       * the sign rather than treating a negative as an error.
       */
      key: "contribution",
      label: "Contribution (acq. revenue − ad spend)",
      format: "currency",
      headline: false,
      group: "Advertising",
      read: (s) => acquisitionRevenue(s) - (s?.adTotals?.spend ?? 0),
    },
  ];

  return spec.map(({ read, ...rest }) => {
    const cur = read(current);
    const prev = read(previous);
    return {
      ...rest,
      current: cur,
      previous: prev,
      delta: cur - prev,
      deltaPct: prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100,
    };
  });
}

/**
 * Per-day normalisation for a metric, so an unequal comparison stays readable.
 *
 * Comparing "Today" against a whole calendar month is not like-for-like. Rather than hiding
 * the comparison or silently misleading, the UI shows the raw figures AND a per-day rate when
 * the two windows differ in length. Ratios (ROAS) are already rates and are never normalised —
 * dividing them by days would be meaningless.
 */
export function perDay(value: number, days: number, format: MetricFormat): number | null {
  if (format === "ratio" || days <= 0) return null;
  return value / days;
}

/** Inclusive day count between two `yyyy-MM-dd` bounds. */
export function inclusiveDayCount(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const [ys, ms, ds] = startDate.split("-").map(Number);
  const [ye, me, de] = endDate.split("-").map(Number);
  if (!ys || !ye) return 0;
  // UTC arithmetic on calendar numbers only — no zone conversion, so DST cannot shift the count.
  const start = Date.UTC(ys, ms - 1, ds);
  const end = Date.UTC(ye, me - 1, de);
  return Math.floor((end - start) / 86_400_000) + 1;
}
