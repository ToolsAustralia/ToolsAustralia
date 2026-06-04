import type { AdminDashboardStats } from "@/hooks/queries/useAdminQueries";
import type { PlatformLogoName } from "@/components/admin/ui";
import type { AttributedPlatformKey } from "@/models/DashboardStatsDailySnapshot";

/**
 * Pure presentation model for the Overview "Advertising" card.
 *
 * Translates the dashboard-stats `attributedRevenue` map (server-side, payment-
 * attributed revenue keyed by convertingPlatform) into render-ready row view-
 * models. React-free so it is unit-testable via tsx; the component only formats
 * these values. Spec: docs/superpowers/specs/2026-06-02-advertising-true-roas-design.md
 */

type AttributedRevenue = NonNullable<AdminDashboardStats["attributedRevenue"]>;
type AttributedEntry = AttributedRevenue[string];

/** Spend cell state — drives display + whether ROAS is computable. */
export type SpendState =
  | { kind: "amount"; value: number } // paid channel with ad spend (Meta today)
  | { kind: "awaiting" } // paid channel, spend sync not live yet (TikTok/Snapchat)
  | { kind: "owned" }; // owned channel, no ad spend by nature (Klaviyo)

/** ROAS cell state. */
export type RoasState =
  | { kind: "value"; value: number } // true ROAS = attributed revenue / ad spend
  | { kind: "needsSpend" } // paid channel but no spend denominator yet
  | { kind: "na" }; // owned channel — ROAS not applicable

/** Extends Record<string, unknown> to satisfy the DataTable generic constraint. */
export interface AdvertisingRowVM extends Record<string, unknown> {
  id: string;
  platformKey: AttributedPlatformKey; // convertingPlatform key for drill-down (meta, …, direct)
  platform: string;
  logo: PlatformLogoName;
  spend: SpendState;
  revenue: number; // attributed acquisition revenue (dollars)
  conversions: number; // new-customer conversions
  roas: RoasState;
  /** Multi-line native-title tooltip with the click/UTM/backfill split; undefined when no revenue. */
  confidenceTitle?: string;
}

interface RowConfig {
  id: string;
  key: AttributedPlatformKey; // attributedRevenue map key (convertingPlatform)
  platform: string;
  logo: PlatformLogoName;
  kind: "paid" | "owned";
}

/** The five rows the card renders, in display order. */
export const ADVERTISING_ROW_CONFIG: RowConfig[] = [
  { id: "facebook", key: "meta", platform: "Facebook Ads", logo: "facebook", kind: "paid" },
  { id: "tiktok", key: "tiktok", platform: "TikTok Ads", logo: "tiktok", kind: "paid" },
  { id: "snapchat", key: "snapchat", platform: "Snapchat Ads", logo: "snapchat", kind: "paid" },
  { id: "klaviyo-email", key: "klaviyo_email", platform: "Klaviyo Email", logo: "klaviyo", kind: "owned" },
  { id: "klaviyo-sms", key: "klaviyo_sms", platform: "Klaviyo SMS", logo: "klaviyo", kind: "owned" },
];

/** Coerce a possibly-missing/non-finite number to a safe finite value (presentation-boundary guard). */
const toFinite = (n: number | undefined): number =>
  typeof n === "number" && Number.isFinite(n) ? n : 0;

/** Build per-row view-models from the attributedRevenue payload (missing keys → zeros). */
export function buildAdvertisingRows(ar: AttributedRevenue | undefined): AdvertisingRowVM[] {
  return ADVERTISING_ROW_CONFIG.map((cfg) => {
    const entry = ar?.[cfg.key];
    const revenue = toFinite(entry?.revenue);
    const conversions = toFinite(entry?.conversions);
    const adSpend = entry?.adSpend;
    const trueRoas = entry?.trueRoas;

    let spend: SpendState;
    let roas: RoasState;
    if (cfg.kind === "owned") {
      spend = { kind: "owned" };
      roas = { kind: "na" };
    } else if (adSpend != null && adSpend > 0) {
      spend = { kind: "amount", value: adSpend };
      // `needsSpend` arm is defensive — the route only emits trueRoas when spend>0 (and finite).
      roas =
        trueRoas != null && Number.isFinite(trueRoas)
          ? { kind: "value", value: trueRoas }
          : { kind: "needsSpend" };
    } else {
      spend = { kind: "awaiting" };
      roas = { kind: "needsSpend" };
    }

    return {
      id: cfg.id,
      platformKey: cfg.key,
      platform: cfg.platform,
      logo: cfg.logo,
      spend,
      revenue,
      conversions,
      roas,
      confidenceTitle: formatConfidenceTitle(entry),
    };
  });
}

/**
 * Build the appended "Direct" row from the `direct` bucket (unattributed /
 * organic payments — no fbclid/ttclid/klaviyo tag). Returns null when there's
 * nothing to show so the card omits the row entirely. This is deliberately NOT
 * part of ADVERTISING_ROW_CONFIG: direct revenue is UNattributed, so it must not
 * inflate the header's "attributed" total or the blended-ROAS denominator. Spend
 * and ROAS are "—" by nature (no ad channel). `revenue` is acquisition only
 * (renewals already excluded upstream), matching the other rows' basis.
 */
export function buildDirectRow(ar: AttributedRevenue | undefined): AdvertisingRowVM | null {
  const entry = ar?.["direct"];
  const revenue = toFinite(entry?.revenue);
  const conversions = toFinite(entry?.conversions);
  if (revenue <= 0 && conversions <= 0) return null;
  return {
    id: "direct",
    platformKey: "direct",
    platform: "Direct",
    logo: "direct",
    spend: { kind: "owned" }, // renders "—" — direct has no ad spend
    revenue,
    conversions,
    roas: { kind: "na" }, // renders "—" — ROAS is not applicable to unattributed revenue
    confidenceTitle: undefined, // direct is unattributed by definition — no click/UTM split to show
  };
}

/**
 * Blended ROAS = Σ revenue ÷ Σ ad spend across paid channels that have spend.
 * Returns null when no paid channel has spend (render "—", never 0.00x).
 */
export function computeBlendedRoas(ar: AttributedRevenue | undefined): number | null {
  if (!ar) return null;
  let revenue = 0;
  let spend = 0;
  for (const cfg of ADVERTISING_ROW_CONFIG) {
    if (cfg.kind !== "paid") continue;
    const entry = ar[cfg.key];
    if (!entry || entry.adSpend == null || entry.adSpend <= 0) continue;
    revenue += entry.revenue;
    spend += entry.adSpend;
  }
  return spend > 0 ? revenue / spend : null;
}

/**
 * Total attributed (acquisition) revenue across ALL displayed rows (paid + owned), dollars.
 * NOTE: deliberately a different scope than computeBlendedRoas' denominator (paid-with-spend
 * only) — the header's "$… attributed" total and "Blended ROAS" are not meant to reconcile.
 */
export function computeTotalAttributedRevenue(ar: AttributedRevenue | undefined): number {
  if (!ar) return 0;
  return ADVERTISING_ROW_CONFIG.reduce((sum, cfg) => sum + toFinite(ar[cfg.key]?.revenue), 0);
}

/** Aggregate ("All Platforms") rollup over the 5 advertising channels — SHARED-3, computed client-side. */
export interface AdvertisingAggregate {
  totalSpend: number; // Σ adSpend over paid channels that have spend (Meta today)
  paidAcquisitionRevenue: number; // Σ revenue over the SAME paid-with-spend channels (the ROAS numerator)
  totalAcquisitionRevenue: number; // Σ revenue over ALL 5 channels (context headline)
  overallRoas: number | null; // paidAcquisitionRevenue / totalSpend ("—" when no spend)
  contributionAfterAdSpend: number; // paidAcquisitionRevenue − totalSpend (NOT bare "profit")
  totalConversions: number; // Σ conversions over all 5 channels
}

/**
 * Roll the per-platform attributed revenue into the All-Platforms aggregate.
 * Ad-effectiveness basis: ROAS + contribution use ONLY paid channels with spend
 * (mirrors the overview card's blended ROAS so the two reconcile); totals span all
 * 5 advertising channels. Renewals are already excluded upstream.
 */
export function computeAggregate(ar: AttributedRevenue | undefined): AdvertisingAggregate {
  let totalSpend = 0;
  let paidAcquisitionRevenue = 0;
  let totalAcquisitionRevenue = 0;
  let totalConversions = 0;
  for (const cfg of ADVERTISING_ROW_CONFIG) {
    const entry = ar?.[cfg.key];
    if (!entry) continue;
    const revenue = toFinite(entry.revenue);
    totalAcquisitionRevenue += revenue;
    totalConversions += toFinite(entry.conversions);
    if (cfg.kind === "paid" && entry.adSpend != null && entry.adSpend > 0) {
      totalSpend += entry.adSpend;
      paidAcquisitionRevenue += revenue;
    }
  }
  return {
    totalSpend,
    paidAcquisitionRevenue,
    totalAcquisitionRevenue,
    overallRoas: totalSpend > 0 ? paidAcquisitionRevenue / totalSpend : null,
    contributionAfterAdSpend: paidAcquisitionRevenue - totalSpend,
    totalConversions,
  };
}

/**
 * Confidence split as a native-title string, e.g.
 * "88% click-verified · 9% UTM-only · 3% backfilled".
 * Returns undefined when the row has no attributed revenue.
 */
export function formatConfidenceTitle(entry: AttributedEntry | undefined): string | undefined {
  if (!entry || entry.revenue <= 0) return undefined;
  const { click, utm_only, inferred_backfill } = entry.byConfidence;
  const total = click + utm_only + inferred_backfill;
  if (total <= 0) return undefined;
  const pct = (n: number) => Math.round((n / total) * 100);
  return `${pct(click)}% click-verified · ${pct(utm_only)}% UTM-only · ${pct(inferred_backfill)}% backfilled`;
}

/** Shared label/color/unit per acquisition source category — used by the drill-down bars. */
export const ACQUISITION_CATEGORY_META: {
  id: "membership-purchase" | "one-time-purchase" | "additional-one-time" | "mini-draw" | "upsell";
  label: string;
  color: string;
  unit: string;
}[] = [
  { id: "membership-purchase", label: "Membership New", color: "#f97316", unit: "subscriptions" },
  { id: "one-time-purchase", label: "One-Time First", color: "#3b82f6", unit: "purchases" },
  { id: "additional-one-time", label: "One-Time Add'l", color: "#6366f1", unit: "purchases" },
  { id: "mini-draw", label: "Mini Draws", color: "#a855f7", unit: "entries" },
  { id: "upsell", label: "Upsells", color: "#ec4899", unit: "purchases" },
];

/** Exact AUD money for the drill-down bars (matches RevenueBreakdownCard). */
export const moneyExact = (n: number) => `$${n.toLocaleString("en-AU", { maximumFractionDigits: 2 })}`;
