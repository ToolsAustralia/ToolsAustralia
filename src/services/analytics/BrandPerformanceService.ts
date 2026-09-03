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
import {
  SpendByUrlAggregationService,
  type AdUrlCheckAdRow,
} from "@/services/analytics/SpendByUrlAggregationService";
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
  resolveBrandLaneFromPromoSlug,
  resolveBrandLaneFromBuiltPrize,
  allocateBrandLanes,
  indexToolboxMix,
  type BrandLane,
  type BrandLaneAllocation,
  type ToolboxMixRow,
  type ToolboxSpendModel,
} from "@/utils/metrics/brand-lane";
import promoAnalyticsRepository from "@/repositories/PromoAnalyticsRepository";
import { getBrandLaneDisplay } from "@/config/promo-landing-slugs";
import { checkAdUrlMismatch } from "@/utils/admin/adUrlMismatchCheck";
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
  /**
   * Ad-URL defects found among THIS row's ads. **Absent when there is nothing to report** —
   * a clean row and a row with no checkable ads both omit it, and neither renders a badge.
   *
   * That asymmetry is the point: a badge is only worth reading if it is rare, so there is
   * deliberately no "all clear" value to render. A green tick on every clean row would train
   * the reader to ignore the column, and a tick on a row whose ads could not be checked at all
   * would be an outright lie.
   *
   * Only ever populated for the CURRENT window — a `comparison` row never carries it.
   */
  adUrlIssues?: BrandAdUrlIssues;
  comparison?: Omit<BrandPerformanceRow, "comparison">;
}

/**
 * The ad-URL brand check, rolled up to one brand row.
 *
 * Two INDEPENDENT defect classes, never merged into one number (they have different fixes):
 *
 *   mismatch          the campaign/ad naming resolves to one brand and the landing URL
 *                     positively contradicts it — a wrong-brand ad hiding inside this row's
 *                     spend. This is the case the roll-up exists for: "Draw 10 | Sales | STIHL"
 *                     spending against `/promotions/makita` was only visible by opening the
 *                     per-brand modal.
 *   unrecognised      a `?toolbox=`/`?toolset=` value matching no known brand (a typo, e.g.
 *   param             `?toolbox=milwakee`) — the URL shape is right, so the landing page
 *                     silently falls back to its default instead of the toolbox the ad promised.
 *
 * An ad can contribute to both, one, or neither. The rule itself is NOT restated here —
 * `checkAdUrlMismatch` is the single validated implementation and this is only its roll-up.
 */
export interface BrandAdUrlIssues {
  /** Ads in this row whose naming contradicts their landing URL's brand. */
  mismatchAdCount: number;
  /** Ads in this row carrying a `?toolbox=`/`?toolset=` value that names no known brand. */
  unrecognisedParamAdCount: number;
  /**
   * How many of this row's ads had a landing URL to check at all — the denominator, so
   * "2 ads" can be read as "2 of 14" rather than as an unscaled scare number. Ads with no
   * resolved destination are excluded: they are unverifiable, not clean and not broken.
   */
  checkedAdCount: number;
  /**
   * Spend carried by the mismatched ads, in AUD, weighted the SAME way the row's `spend` is —
   * so "$157 of $330" is a comparison the reader can make against the cell next to it.
   */
  mismatchSpend: number;
  /** The brands those mismatched ads' campaign/ad names actually name (e.g. ["stihl"]). */
  mismatchBrands: string[];
  /** The unrecognised param values found (e.g. ["milwakee"]), so the fix is one glance away. */
  unrecognisedValues: string[];
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
    /**
     * How bare-toolset-page spend was assigned to toolbox lanes. null for the toolset lane,
     * where the URL names the brand exactly and no modelling happens.
     *
     * "observed-mix"  split by the visitor mix the page actually drew (the accurate model)
     * "page-default"  everything to the page first-paint default (fallback: no visit data in
     *                 the window, e.g. older than the PromoAnalyticsVisit TTL) — SKEWS toward
     *                 whichever toolbox is the default
     * "mixed"         both, on different pages
     */
    toolboxSpendModel: ToolboxSpendModel | "mixed" | null;
    /**
     * How many visitor builds the observed-mix split was computed from, across every toolset
     * page in the window. null when nothing was modelled.
     *
     * Surfaced because the split can be STATISTICALLY THIN: builder beacons are far sparser
     * than ad impressions, so a handful of visitors can end up dividing thousands of dollars
     * of spend. The reader has to be able to see the sample behind the number.
     */
    toolboxMixVisitors: number | null;
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
  adUrl: {
    checkedAds: number;
    mismatchAds: number;
    unrecognisedParamAds: number;
    mismatchSpend: number;
    mismatchBrands: Set<string>;
    unrecognisedValues: Set<string>;
  };
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
    adUrl: {
      checkedAds: 0,
      mismatchAds: 0,
      unrecognisedParamAds: 0,
      mismatchSpend: 0,
      mismatchBrands: new Set(),
      unrecognisedValues: new Set(),
    },
  };
}

export class BrandPerformanceService {
  private spendService = new SpendByUrlAggregationService();

  async getBrandPerformance(query: BrandPerformanceQuery): Promise<BrandPerformanceResult> {
    await connectDB();

    const [current, comparison] = await Promise.all([
      this.computeWindow(query, query.startDate, query.endDate, { adUrlCheck: true }),
      query.compareTo
        ? // No ad-URL check on the comparison window: nothing renders a badge for a prior
          // period, so running it there would be two extra queries per platform for a result
          // that is thrown away.
          this.computeWindow(query, query.compareTo.startDate, query.compareTo.endDate, {
            adUrlCheck: false,
          })
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
    options: { adUrlCheck: boolean },
  ): Promise<BrandPerformanceResult> {
    const { lane, basis, platform } = query;

    const scopes: AdDestinationPlatform[] = platform === "all" ? [...AD_PLATFORMS] : [platform];
    const spend: BrandSpendSource[] = [];
    const adChecks: BrandAdUrlCheckSource[] = [];

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

      if (options.adUrlCheck) {
        try {
          const ads = await this.spendService.getAdUrlCheckRows(
            p,
            adAccountId,
            startDate,
            endDate,
          );
          adChecks.push({ platform: p, ads });
        } catch {
          // Best-effort, exactly like the freshness sync above: the badge is a supplementary
          // signal on rows that are correct without it. Losing it must never blank the table.
        }
      }
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
            /**
             * Selecting ONE platform must scope the revenue too, not just the spend.
             *
             * Until 2026-08-20 it didn't: picking TikTok narrowed spend to TikTok while leaving
             * revenue at every channel's, so the same $770 appeared under Meta AND TikTok and
             * the per-platform ROAS was all-channel revenue ÷ one platform's spend — 8.95x on a
             * table whose true blended figure was 0.97x. Confidently wrong in the direction that
             * makes a channel look good.
             *
             * `convertingPlatform` is the canonical platform basis (master spec §3.1.1) — never
             * `data.utmSource`, which is a different classifier and will not reconcile with the
             * daily snapshot.
             *
             * `platform=all` stays unfiltered on purpose: it is the whole-picture view, so its
             * revenue includes direct/organic/email that no ad bought. Meta + TikTok therefore
             * do NOT sum to All, and the gap is exactly that non-ad revenue — surfaced in the UI
             * rather than left for the reader to trip over.
             */
            ...(platform !== "all" ? { convertingPlatform: platform } : {}),
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

    /**
     * The observed visitor mix per toolset landing page — how a bare `/promotions/<toolset>`
     * page's spend divides across toolbox lanes.
     *
     * ⚠️ Fetched ONLY for `lane=toolbox` AND `basis=built-prize`. Applying it under the other
     * bases produced a genuinely misleading table (caught on production data, 2026-08-20):
     * spend was split by what visitors BUILT while revenue under `landing-page` is keyed on
     * `promotionSlug`, which resolves a bare toolset page to its DEFAULT toolbox — so the two
     * sides of every ROAS were keyed differently. One brand collected 73% of the spend with
     * zero revenue while another collected all the revenue on a fraction of the spend, and
     * every per-row ROAS in that view was meaningless.
     *
     * The rule now: the mix belongs to the basis whose OUTCOMES are keyed on what was built.
     *   built-prize   revenue by builtPrizeSlug   -> spend by observed mix   (consistent)
     *   landing-page  revenue by promotionSlug    -> spend by page default   (consistent)
     *   platform      revenue by canonical URL    -> spend by page default   (consistent)
     */
    let toolboxMix: ToolboxMixRow[] = [];
    if (lane === "toolbox" && basis === "built-prize") {
      const { dayStartUTC } = aestDayBounds(startDate);
      const { dayEndUTC } = aestDayBounds(endDate);
      try {
        toolboxMix = await promoAnalyticsRepository.getToolboxMixByToolsetPage(
          dayStartUTC,
          dayEndUTC,
        );
      } catch {
        // Best-effort. Losing the mix degrades to the page-default model, which the response
        // reports — it must never blank the table.
      }
    }

    return buildBrandPerformanceWindow({
      lane,
      basis,
      platform,
      startDate,
      endDate,
      spend,
      events,
      toolboxMix,
      adChecks,
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

/**
 * Per-platform ad-level input for the ad-URL check roll-up.
 *
 * Separate from `BrandSpendSource` on purpose: spend rows are keyed per canonical URL and
 * carry no ad identity at all, which is exactly why the check could not be run from them.
 */
export interface BrandAdUrlCheckSource {
  platform: AdDestinationPlatform;
  ads: AdUrlCheckAdRow[];
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
  /** Observed visitor mix per toolset page. Toolbox lane only; empty = page-default model. */
  toolboxMix?: ToolboxMixRow[];
  /** Per-ad rows for the ad-URL check roll-up. Omitted/empty = no badge on any row. */
  adChecks?: BrandAdUrlCheckSource[];
}): BrandPerformanceResult {
  const { lane, basis, platform, startDate, endDate, spend, events, toolboxMix, adChecks } = input;

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
  //
  // A bare `/promotions/<toolset>` URL names no toolbox, so under the toolbox lane its spend
  // must be assigned by modelling. Which model is correct depends on how THIS basis keys its
  // outcomes — the caller only supplies `toolboxMix` for `basis=built-prize`, so an empty mix
  // here means "use the page default" and the two sides of every ROAS stay keyed the same way.
  // `allocateBrandLanes` returns weights summing to 1 either way, so nothing is created or lost
  // and the Total still reconciles with the ad account.
  const mixBySlug = indexToolboxMix(toolboxMix ?? []);
  const modelsUsed = new Set<ToolboxSpendModel>();
  const mixVisitors = (toolboxMix ?? []).reduce((t, r) => t + r.visitors, 0);

  let contributingPlatforms = 0;
  for (const source of spend) {
    if (source.rows.length > 0) contributingPlatforms += 1;
    for (const r of source.rows) {
      const { allocations, model } = allocateBrandLanes(r.canonicalUrl, lane, mixBySlug);
      if (model) modelsUsed.add(model);

      const shares: BrandLaneAllocation[] =
        allocations.length > 0 ? allocations : [{ laneId: UNATTRIBUTED, weight: 1 }];

      for (const { laneId, weight } of shares) {
        const b = bucket(laneId);
        b.spend += (r.spendCents / CENTS) * weight;
        b.platforms.add(source.platform);
        b.urls[source.platform].add(r.canonicalUrl);

        // Under the platform basis the SAME rows supply revenue and conversions — no
        // PaymentEvent query runs at all, so this basis is strictly cheaper than the others.
        // They are URL-keyed too, so they take the same split; otherwise a modelled spend
        // would be divided by an unmodelled revenue and the ROAS would be nonsense.
        if (basis === "platform") {
          b.revenue += (r.revenueCents / CENTS) * weight;
          b.purchases += r.conversions * weight;
        }
      }
    }
  }

  // ── Ad-URL check roll-up ──────────────────────────────────────────────────────────────
  //
  // Bucketed through the SAME `allocateBrandLanes` call the spend above went through, keyed on
  // the SAME `canonicalUrl`. That is the whole reason this runs here rather than in a separate
  // service: a finding is only useful if it lands in the row whose spend it is hiding inside,
  // and the only way to guarantee that is to reuse the allocation, not re-derive it.
  //
  // Two units, deliberately weighted differently under the toolbox lane, where a bare
  // `/promotions/<toolset>` page's spend splits across several toolbox rows:
  //   SPEND  takes the allocation weight, so `mismatchSpend` is comparable to the `spend` cell
  //          printed beside it.
  //   COUNTS do not. There is no such thing as 0.4 of a wrong-brand ad, and a reader opening
  //          the drill-down would find the whole ad sitting there. Each lane the ad touches
  //          counts it once, whole.
  for (const source of adChecks ?? []) {
    for (const ad of source.ads) {
      // RAW urls, never the canonical form — the `?toolbox=`/`?toolset=` the check depends on
      // is stripped from the canonical one (spec B1). Falling back to the canonical URL only
      // when no raw URL survived is what the per-ad icon in `CampaignTreeTable` does too.
      const urls =
        ad.rawUrls && ad.rawUrls.length > 0
          ? ad.rawUrls
          : ad.canonicalUrl
            ? [ad.canonicalUrl]
            : [];
      // No destination resolved at all: unverifiable. NOT counted as checked, and never a
      // finding — the same rule the check itself applies to a missing `?toolbox=`.
      if (urls.length === 0) continue;

      const check = checkAdUrlMismatch({
        campaignName: ad.campaignName,
        adName: ad.adName,
        urls,
      });
      const isMismatch = check.verdict === "mismatch";

      const { allocations } = allocateBrandLanes(ad.canonicalUrl ?? "", lane, mixBySlug);
      const adShares: BrandLaneAllocation[] =
        allocations.length > 0 ? allocations : [{ laneId: UNATTRIBUTED, weight: 1 }];

      for (const { laneId, weight } of adShares) {
        const b = bucket(laneId);
        b.adUrl.checkedAds += 1;
        if (isMismatch) {
          b.adUrl.mismatchAds += 1;
          b.adUrl.mismatchSpend += (ad.spendCents / CENTS) * weight;
          if (check.campaignBrand) b.adUrl.mismatchBrands.add(check.campaignBrand);
        }
        if (check.unrecognisedParamValues.length > 0) {
          b.adUrl.unrecognisedParamAds += 1;
          for (const v of check.unrecognisedParamValues) b.adUrl.unrecognisedValues.add(v.value);
        }
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
      // Omitted entirely unless there is a finding — see `BrandPerformanceRow.adUrlIssues`.
      // A clean row and an uncheckable row are indistinguishable here ON PURPOSE: neither
      // has anything true to say, and the UI must render nothing for both.
      ...(b.adUrl.mismatchAds > 0 || b.adUrl.unrecognisedParamAds > 0
        ? {
            adUrlIssues: {
              mismatchAdCount: b.adUrl.mismatchAds,
              unrecognisedParamAdCount: b.adUrl.unrecognisedParamAds,
              checkedAdCount: b.adUrl.checkedAds,
              mismatchSpend: b.adUrl.mismatchSpend,
              mismatchBrands: [...b.adUrl.mismatchBrands].sort(),
              unrecognisedValues: [...b.adUrl.unrecognisedValues].sort(),
            },
          }
        : {}),
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
      // Which model assigned bare-toolset-page spend to toolbox lanes. Reported rather than
      // hidden: "page-default" is a fallback that skews toward whichever toolbox is the page
      // default, and the reader must be able to tell a measurement from a model.
      toolboxSpendModel:
        lane !== "toolbox" || modelsUsed.size === 0
          ? null
          : modelsUsed.size > 1
            ? "mixed"
            : [...modelsUsed][0],
      toolboxMixVisitors: lane === "toolbox" && modelsUsed.has("observed-mix") ? mixVisitors : null,
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
