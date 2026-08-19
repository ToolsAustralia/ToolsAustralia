/**
 * Brand Performance — ad spend and return per BRAND LANE (toolset or toolbox).
 *
 * Answers the question the ads team actually spends against: for each brand, what did we
 * spend, what came back, how much of that return is NEW MEMBERSHIP, and what is the ROAS.
 *
 * ── Two sources, one lane mapping ─────────────────────────────────────────────────────────
 *
 * SPEND is only ever knowable per CANONICAL URL (`LandingPageMetricsDaily`), because
 * `canonicalizeLandingUrl` strips query strings — the visitor's `?toolbox=` choice never
 * reaches the ad aggregate. OUTCOMES are only ever knowable server-side (`PaymentEvent`).
 * `basis` selects which key attributes the outcomes; both sides bucket through the same
 * `brand-lane` rules so they cannot drift apart.
 *
 *   landing-page  outcomes keyed on `data.promotionSlug`  — exact join with spend; the number
 *                 to act on when deciding where the budget goes.
 *   built-prize   outcomes keyed on `data.builtPrizeSlug` — what buyers actually chose; spend
 *                 is still URL-derived, so ROAS here is indicative, not exact.
 *   platform      outcomes are the AD PLATFORM's own reported revenue/conversions from the
 *                 same rows spend comes from — i.e. what Ads Manager shows. No membership
 *                 split exists in platform data.
 *
 * `basis` is a parameter, not a second service: spend, lane resolution, comparison windows,
 * totals and percentage maths are shared verbatim; only the outcome source branches.
 *
 * ── Invariants (Advertising Analytics Suite master spec §3.1) ─────────────────────────────
 *
 *  - Renewals excluded via `data.billingReason === "subscription_cycle"`, NEVER the top-level
 *    `isRenewal` flag (which defaults false on historical rows). Enforced for free by
 *    delegating to `classifyAcquisitionCategory`.
 *  - Refunds netted whole-row via `excludeRefundedBenefitsGrantedStages()`.
 *  - ROAS recomputed from SUMMED spend ÷ SUMMED revenue, never averaged across rows.
 *  - `platform=all` sums SPEND only. Platform-reported revenue is each platform's own
 *    attribution and the same purchase can be claimed by both, so combining it double-counts.
 */

import connectDB from "@/lib/mongodb";
import PaymentEvent from "@/models/PaymentEvent";
import { SpendByUrlAggregationService } from "@/services/analytics/SpendByUrlAggregationService";
import { ensureSpendByUrlFreshness } from "@/services/meta/spendByUrlFreshness";
import { resolveAdAccountId, AD_PLATFORMS } from "@/services/analytics/adPlatformAccounts";
import { excludeRefundedBenefitsGrantedStages } from "@/utils/payment/payment-event-net-queries";
import {
  classifyAcquisitionCategory,
  ACQUISITION_CATEGORIES,
  type AcquisitionCategory,
  type LeanRevenueEvent,
  type PlatformByCategoryEntry,
} from "@/services/admin/platformRevenueBreakdown";
import { aestDayBounds } from "@/services/admin/dashboard-stats/DashboardStatsSnapshotWriter";
import {
  resolveBrandLaneFromCanonicalUrl,
  resolveBrandLaneFromPromoSlug,
  resolveBrandLaneFromBuiltPrize,
  type BrandLane,
} from "@/utils/metrics/brand-lane";
import { getBrandLaneDisplay } from "@/config/promo-landing-slugs";
import type { AdDestinationPlatform } from "@/models/AdDestination";

/** Where a row's outcome figures come from. */
export type BrandPerformanceBasis = "landing-page" | "built-prize" | "platform";

/** Spend scope. "all" sums spend across every configured platform (never revenue). */
export type BrandPerformancePlatformScope = AdDestinationPlatform | "all";

export interface BrandPerformanceQuery {
  startDate: string;
  endDate: string;
  lane: BrandLane;
  basis: BrandPerformanceBasis;
  platform: BrandPerformancePlatformScope;
  /** When set, the same query is run over this window and attached as `comparison`. */
  compareTo?: { startDate: string; endDate: string };
}

export interface BrandPerformanceRow {
  laneId: string;
  displayName: string;
  logoPath: string;
  spend: number;
  revenue: number;
  /** revenue / spend; 0 when spend is 0. Recomputed from totals, never averaged. */
  roas: number;
  /** Count across ALL acquisition categories (membership, one-time, additional, mini-draw, upsell). */
  purchases: number;
  /** null under the platform basis — platform data carries no membership split. */
  newMemberships: number | null;
  newMembershipRevenue: number | null;
  /** newMemberships / purchases, as a percent. null when unavailable, 0 when no purchases. */
  newMembershipCountPct: number | null;
  /** newMembershipRevenue / revenue, as a percent. null when unavailable, 0 when no revenue. */
  newMembershipRevenuePct: number | null;
  /** Full 5-bucket acquisition split for the drill-down. Empty under the platform basis. */
  byCategory: PlatformByCategoryEntry[];
  /** Which platforms contributed spend to this row. */
  platforms: AdDestinationPlatform[];
  /** Landing URLs behind this row, per platform — handed to the per-ad drill-down. */
  canonicalUrlsByPlatform: Record<AdDestinationPlatform, string[]>;
  comparison?: Omit<BrandPerformanceRow, "comparison">;
}

export interface BrandPerformanceResult {
  meta: {
    startDate: string;
    endDate: string;
    lane: BrandLane;
    basis: BrandPerformanceBasis;
    platform: BrandPerformancePlatformScope;
    currency: "AUD";
    /** True when spend and revenue come from more than one platform under the platform basis. */
    blendedPlatformRevenue: boolean;
    comparison?: { startDate: string; endDate: string };
  };
  rows: BrandPerformanceRow[];
  /** Spend/outcomes that resolved to no lane. Kept so totals reconcile with the ad account. */
  unattributed: Omit<BrandPerformanceRow, "comparison"> | null;
  totals: Omit<BrandPerformanceRow, "comparison" | "canonicalUrlsByPlatform" | "platforms">;
}

const CENTS = 100;
const UNATTRIBUTED = "__unattributed__";

/** Zeroed accumulator for one lane bucket. */
interface Bucket {
  spend: number;
  revenue: number;
  purchases: number;
  newMemberships: number;
  newMembershipRevenue: number;
  categories: Map<
    AcquisitionCategory,
    { revenue: number; purchaseCount: number; users: Set<string> }
  >;
  platforms: Set<AdDestinationPlatform>;
  urls: Record<AdDestinationPlatform, Set<string>>;
}

function emptyBucket(): Bucket {
  return {
    spend: 0,
    revenue: 0,
    purchases: 0,
    newMemberships: 0,
    newMembershipRevenue: 0,
    categories: new Map(),
    platforms: new Set(),
    urls: { meta: new Set(), tiktok: new Set() },
  };
}

export class BrandPerformanceService {
  private spendService = new SpendByUrlAggregationService();

  async getBrandPerformance(query: BrandPerformanceQuery): Promise<BrandPerformanceResult> {
    await connectDB();

    const [current, comparison] = await Promise.all([
      this.computeWindow(query, query.startDate, query.endDate),
      query.compareTo
        ? this.computeWindow(query, query.compareTo.startDate, query.compareTo.endDate)
        : Promise.resolve(null),
    ]);

    if (comparison) {
      const byLane = new Map(comparison.rows.map((r) => [r.laneId, r]));
      for (const row of current.rows) {
        const prior = byLane.get(row.laneId);
        // A lane with no prior activity compares against an explicit zero row, not "no data" —
        // "first spend this month" is a real reading, and hiding it would make a new brand look
        // like a rendering gap.
        row.comparison = prior ?? this.zeroRow(row.laneId, query.lane, query.basis);
      }
    }

    return {
      ...current,
      meta: {
        ...current.meta,
        ...(query.compareTo ? { comparison: query.compareTo } : {}),
      },
    };
  }

  /**
   * One window's worth of rows: fetch, then hand to the pure builder.
   *
   * The I/O and the maths are split so the maths can be unit-tested without a database —
   * the same shape `SpendByUrlAggregationService` uses with `buildLandingPageDailyDocs`.
   */
  private async computeWindow(
    query: BrandPerformanceQuery,
    startDate: string,
    endDate: string,
  ): Promise<BrandPerformanceResult> {
    const { lane, basis, platform } = query;

    const scopes: AdDestinationPlatform[] = platform === "all" ? [...AD_PLATFORMS] : [platform];
    const spend: BrandSpendSource[] = [];

    for (const p of scopes) {
      const adAccountId = resolveAdAccountId(p);
      // An unconfigured platform is not an error here — under `all` it simply contributes
      // nothing, so one missing integration never blanks the whole table.
      if (!adAccountId) continue;

      try {
        // Near-real-time: refresh the trailing days when stale, same as the spend-by-url route.
        await ensureSpendByUrlFreshness(p, adAccountId, startDate, endDate);
      } catch {
        // Freshness is best-effort; stale-but-present data beats an empty table.
      }

      const rows = await this.spendService.getAggregatedSpendByUrl(
        p,
        adAccountId,
        startDate,
        endDate,
      );
      spend.push({ platform: p, rows });
    }

    let events: BrandOutcomeEvent[] = [];
    if (basis !== "platform") {
      const field = basis === "landing-page" ? "data.promotionSlug" : "data.builtPrizeSlug";
      const { dayStartUTC } = aestDayBounds(startDate);
      const { dayEndUTC } = aestDayBounds(endDate);

      events = await PaymentEvent.aggregate<BrandOutcomeEvent>([
        {
          $match: {
            eventType: "BenefitsGranted",
            // Exclusive right edge (master spec §3.1.5) — `aestDayBounds` returns next-midnight.
            timestamp: { $gte: dayStartUTC, $lt: dayEndUTC },
          },
        },
        ...excludeRefundedBenefitsGrantedStages(),
        {
          $project: {
            userId: 1,
            packageType: 1,
            packageId: 1,
            data: 1,
            _laneKey: `$${field}`,
          },
        },
      ]).exec();
    }

    return buildBrandPerformanceWindow({
      lane,
      basis,
      platform,
      startDate,
      endDate,
      spend,
      events,
    });
  }

  /** An explicit all-zero row, used when a lane has no activity in the comparison window. */
  private zeroRow(
    laneId: string,
    lane: BrandLane,
    basis: BrandPerformanceBasis,
  ): Omit<BrandPerformanceRow, "comparison"> {
    return zeroBrandRow(laneId, lane, basis);
  }
}

/** Per-platform spend input to the pure builder. */
export interface BrandSpendSource {
  platform: AdDestinationPlatform;
  rows: Array<{
    canonicalUrl: string;
    spendCents: number;
    revenueCents: number;
    conversions: number;
  }>;
}

/** A net BenefitsGranted event with its lane key projected by the caller. */
export type BrandOutcomeEvent = LeanRevenueEvent & { _laneKey?: string };

/**
 * PURE: turn spend rows + outcome events into brand rows, totals and the unattributed bucket.
 *
 * Exported so the maths is unit-testable without a database — the invariants this enforces
 * (ROAS from totals, acquisition-only via `classifyAcquisitionCategory`, zero-denominator
 * percentages, unattributed included in totals) are exactly the things that silently rot.
 */
export function buildBrandPerformanceWindow(input: {
  lane: BrandLane;
  basis: BrandPerformanceBasis;
  platform: BrandPerformancePlatformScope;
  startDate: string;
  endDate: string;
  spend: BrandSpendSource[];
  events: BrandOutcomeEvent[];
}): BrandPerformanceResult {
  const { lane, basis, platform, startDate, endDate, spend, events } = input;

  const buckets = new Map<string, Bucket>();
  const bucket = (id: string) => {
    let b = buckets.get(id);
    if (!b) {
      b = emptyBucket();
      buckets.set(id, b);
    }
    return b;
  };

  // ── Spend (always URL-keyed, for every basis) ─────────────────────────────────────────
  let contributingPlatforms = 0;
  for (const source of spend) {
    if (source.rows.length > 0) contributingPlatforms += 1;
    for (const r of source.rows) {
      const laneId = resolveBrandLaneFromCanonicalUrl(r.canonicalUrl, lane) ?? UNATTRIBUTED;
      const b = bucket(laneId);
      b.spend += r.spendCents / CENTS;
      b.platforms.add(source.platform);
      b.urls[source.platform].add(r.canonicalUrl);

      // Under the platform basis the SAME rows supply revenue and conversions — no
      // PaymentEvent query runs at all, so this basis is strictly cheaper than the others.
      if (basis === "platform") {
        b.revenue += r.revenueCents / CENTS;
        b.purchases += r.conversions;
      }
    }
  }

  // ── Outcomes (server-side bases only) ─────────────────────────────────────────────────
  if (basis !== "platform") {
    for (const e of events) {
      // Renewals and unknown package types classify to null and are dropped — the master
      // spec's acquisition-only basis, enforced by the shared classifier rather than by a
      // predicate written again here.
      const category = classifyAcquisitionCategory(e);
      if (!category) continue;

      const key = typeof e._laneKey === "string" ? e._laneKey : "";
      const laneId =
        (key
          ? basis === "landing-page"
            ? resolveBrandLaneFromPromoSlug(key, lane)
            : resolveBrandLaneFromBuiltPrize(key, lane)
          : null) ?? UNATTRIBUTED;

      const b = bucket(laneId);
      const price = e.data?.price || 0;
      b.revenue += price;
      b.purchases += 1;
      if (category === "membership-purchase") {
        b.newMemberships += 1;
        b.newMembershipRevenue += price;
      }

      let cat = b.categories.get(category);
      if (!cat) {
        cat = { revenue: 0, purchaseCount: 0, users: new Set() };
        b.categories.set(category, cat);
      }
      cat.revenue += price;
      cat.purchaseCount += 1;
      const uid = e.userId?.toString();
      if (uid) cat.users.add(uid);
    }
  }

  // ── Shape ──────────────────────────────────────────────────────────────────────────
  const toRow = (laneId: string, b: Bucket): Omit<BrandPerformanceRow, "comparison"> => {
    const display =
      laneId === UNATTRIBUTED
        ? { label: "Unattributed", logoPath: "" }
        : getBrandLaneDisplay(laneId, lane);
    const serverBasis = basis !== "platform";
    return {
      laneId,
      displayName: display.label,
      logoPath: display.logoPath,
      spend: b.spend,
      revenue: b.revenue,
      roas: b.spend > 0 ? b.revenue / b.spend : 0,
      purchases: b.purchases,
      newMemberships: serverBasis ? b.newMemberships : null,
      newMembershipRevenue: serverBasis ? b.newMembershipRevenue : null,
      newMembershipCountPct: serverBasis
        ? b.purchases > 0
          ? (b.newMemberships / b.purchases) * 100
          : 0
        : null,
      newMembershipRevenuePct: serverBasis
        ? b.revenue > 0
          ? (b.newMembershipRevenue / b.revenue) * 100
          : 0
        : null,
      byCategory: serverBasis
        ? ACQUISITION_CATEGORIES.map((category) => {
            const c = b.categories.get(category);
            return {
              category,
              revenue: c?.revenue ?? 0,
              purchaseCount: c?.purchaseCount ?? 0,
              userCount: c?.users.size ?? 0,
            };
          })
        : [],
      platforms: [...b.platforms],
      canonicalUrlsByPlatform: {
        meta: [...b.urls.meta],
        tiktok: [...b.urls.tiktok],
      },
    };
  };

  const rows = [...buckets.entries()]
    .filter(([id]) => id !== UNATTRIBUTED)
    .map(([id, b]) => toRow(id, b))
    .filter((r) => r.spend > 0 || r.revenue > 0 || r.purchases > 0)
    .sort((a, b) => b.spend - a.spend || a.displayName.localeCompare(b.displayName));

  const unattributedBucket = buckets.get(UNATTRIBUTED);
  const unattributed =
    unattributedBucket &&
    (unattributedBucket.spend > 0 ||
      unattributedBucket.revenue > 0 ||
      unattributedBucket.purchases > 0)
      ? toRow(UNATTRIBUTED, unattributedBucket)
      : null;

  // Totals include the unattributed bucket: the whole point of surfacing it is that the
  // Total still reconciles with the ad account and the Overview revenue card.
  const all = unattributed ? [...rows, unattributed] : rows;
  const sum = (pick: (r: (typeof all)[number]) => number) => all.reduce((t, r) => t + pick(r), 0);
  const totalSpend = sum((r) => r.spend);
  const totalRevenue = sum((r) => r.revenue);
  const totalPurchases = sum((r) => r.purchases);
  const serverBasis = basis !== "platform";
  const totalNewMemberships = serverBasis ? sum((r) => r.newMemberships ?? 0) : null;
  const totalNewMembershipRevenue = serverBasis ? sum((r) => r.newMembershipRevenue ?? 0) : null;

  /**
   * Total-level category split, unioned from the BUCKETS rather than summed from the shaped
   * rows — `userCount` is a distinct count, and one buyer can appear in two lanes, so adding
   * per-lane user counts would over-report. Revenue and purchase counts are additive and are
   * simply summed.
   */
  const visibleLaneIds = new Set(all.map((r) => r.laneId));
  const totalByCategory: PlatformByCategoryEntry[] = serverBasis
    ? ACQUISITION_CATEGORIES.map((category) => {
        let revenue = 0;
        let purchaseCount = 0;
        const users = new Set<string>();
        for (const [laneId, b] of buckets) {
          if (!visibleLaneIds.has(laneId)) continue;
          const c = b.categories.get(category);
          if (!c) continue;
          revenue += c.revenue;
          purchaseCount += c.purchaseCount;
          for (const u of c.users) users.add(u);
        }
        return { category, revenue, purchaseCount, userCount: users.size };
      })
    : [];

  return {
    meta: {
      startDate,
      endDate,
      lane,
      basis,
      platform,
      currency: "AUD",
      // Only the platform basis can double-count: two platforms each claiming the same
      // purchase. Server bases read our own ledger once, so combining platforms is safe.
      blendedPlatformRevenue: basis === "platform" && contributingPlatforms > 1,
    },
    rows,
    unattributed,
    totals: {
      laneId: "__total__",
      displayName: "Total",
      logoPath: "",
      spend: totalSpend,
      revenue: totalRevenue,
      roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
      purchases: totalPurchases,
      newMemberships: totalNewMemberships,
      newMembershipRevenue: totalNewMembershipRevenue,
      newMembershipCountPct:
        totalNewMemberships === null
          ? null
          : totalPurchases > 0
            ? (totalNewMemberships / totalPurchases) * 100
            : 0,
      newMembershipRevenuePct:
        totalNewMembershipRevenue === null
          ? null
          : totalRevenue > 0
            ? (totalNewMembershipRevenue / totalRevenue) * 100
            : 0,
      byCategory: totalByCategory,
    },
  };
}

/**
 * An explicit all-zero row, used when a lane has activity now but none in the comparison
 * window. Deliberately not "no data": "first spend this month" is a real reading, and hiding
 * it would make a newly-launched brand look like a rendering gap.
 */
export function zeroBrandRow(
  laneId: string,
  lane: BrandLane,
  basis: BrandPerformanceBasis,
): Omit<BrandPerformanceRow, "comparison"> {
  const display =
    laneId === UNATTRIBUTED
      ? { label: "Unattributed", logoPath: "" }
      : getBrandLaneDisplay(laneId, lane);
  const serverBasis = basis !== "platform";
  return {
    laneId,
    displayName: display.label,
    logoPath: display.logoPath,
    spend: 0,
    revenue: 0,
    roas: 0,
    purchases: 0,
    newMemberships: serverBasis ? 0 : null,
    newMembershipRevenue: serverBasis ? 0 : null,
    newMembershipCountPct: serverBasis ? 0 : null,
    newMembershipRevenuePct: serverBasis ? 0 : null,
    byCategory: serverBasis
      ? ACQUISITION_CATEGORIES.map((category) => ({
          category,
          revenue: 0,
          purchaseCount: 0,
          userCount: 0,
        }))
      : [],
    platforms: [],
    canonicalUrlsByPlatform: { meta: [], tiktok: [] },
  };
}

export const brandPerformanceService = new BrandPerformanceService();
