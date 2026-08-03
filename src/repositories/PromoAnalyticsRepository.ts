import connectDB from "@/lib/mongodb";
import PromoAnalyticsVisit from "@/models/PromoAnalyticsVisit";
import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import { excludeRefundedBenefitsGrantedStages } from "@/utils/payment/payment-event-net-queries";
import { channelKeyExpr, channelMatch } from "@/services/attribution/normalizePlatform";
import { channelLabel, channelOrder } from "@/config/attribution-channels";
import type { ConvertingPlatform } from "@/types/attribution";
import { listPrizes, getPrizeLabel } from "@/config/prizes";
import {
  TOOLSET_LANDING_SLUGS,
  PRIZE_LANE_SLUGS,
  getPageDefaultPrizeSlug,
} from "@/config/promo-landing-slugs";
import { getPageTypeFromSlug } from "@/utils/promo-analytics/validate-promo-slug";
import mongoose from "mongoose";
import type { PromoPageType } from "@/models/PromoAnalyticsVisit";
import type {
  UTMCampaignMetrics,
  PageDetailResult,
  PageBuildBreakdown,
  PrizeBuildMetrics,
  ChannelPageMetrics,
  ChannelCampaignMetrics,
  ChannelDetailResult,
  ChannelRawSource,
} from "@/types/promo-analytics";

export interface PromoPageMetrics {
  pageType: PromoPageType;
  slug: string;
  visits: number;
  /**
   * Unique visitors who ended on SOME combination on this page (exposure).
   * Effectively everyone who loaded the builder — the beacon records what was on screen
   * regardless of interaction, so builders and signups count the same population (F-018).
   */
  buildVisitors: number;
  /** Of `buildVisitors`, those who actually CHANGED the build (engagement). */
  builds: number;
  /** `builds / buildVisitors` as a percentage. 0 when nobody saw a combination. */
  buildChangeRate: number;
  /** The combination built by the most visitors on this page, or null if nobody built one. */
  topBuiltPrize: string | null;
  /** Every combination built on this page, most-built first. Empty when nobody built one. */
  buildDistribution: Array<{ builtPrizeSlug: string; visitors: number }>;
  signups: number;
  conversions: number;
  revenue: number;
  visitToSignupRate: number;
  signupToConversionRate: number;
  overallConversionRate: number;
}

export interface PromoAnalyticsSummary {
  totalVisits: number;
  totalSignups: number;
  totalConversions: number;
  totalRevenue: number;
  byPage: PromoPageMetrics[];
}

export interface ChannelMetrics {
  /** Canonical acquisition channel. `facebook.com`/`ig`/`fb` all resolve to `meta`. */
  channel: ConvertingPlatform;
  /** Human label from config — never derived in this layer. */
  channelLabel: string;
  visits: number;
  signups: number;
  conversions: number;
  revenue: number;
  visitToSignupRate: number;
  signupToConversionRate: number;
  overallConversionRate: number;
}

export interface PromoAnalyticsByChannelSummary {
  byChannel: ChannelMetrics[];
}

export interface BuiltPrizeMetrics {
  builtPrizeSlug: string;
  /** Unique visitors who built this combination, across every landing page. */
  builders: number;
  /** New accounts whose signupAttribution.builtPrizeSlug is this combination. */
  signups: number;
  /** Purchases whose PaymentEvent.data.builtPrizeSlug is this combination. */
  conversions: number;
  /** AUD dollars from those purchases. */
  revenue: number;
  builderToSignupRate: number;
  signupToConversionRate: number;
  overallConversionRate: number;
}

/** A toolbox lane (Kincrome, Milwaukee, ...) rolled up across every combination that uses it. */
export interface ToolboxMetrics {
  toolboxId: string;
  /** Unique visitors who ended on ANY combination with this toolbox. Deduped in Mongo. */
  builders: number;
  /** Of those, the ones who changed the build. */
  interactedBuilders: number;
  signups: number;
  conversions: number;
  revenue: number;
  builderToSignupRate: number;
  signupToConversionRate: number;
  overallConversionRate: number;
}

export interface PromoAnalyticsByBuiltPrizeSummary {
  byBuiltPrize: BuiltPrizeMetrics[];
}

/**
 * Visitor identity for dedup: userId if set, else anonymousId.
 * No-id visits get a unique placeholder so each counts once (can't dedup unknown visitors).
 *
 * The outer `$ifNull` is load-bearing, not defensive noise. Without it the inner expression can
 * still resolve to null/missing for a malformed row (e.g. `$concat` returns null the moment any
 * argument is null), and the two ways this codebase counts distinct visitors then DISAGREE:
 *
 *   `$addToSet` + `$size`  — silently drops a missing value
 *   `$group: { _id: expr }` — collapses every such row into ONE null bucket
 *
 * Measured against production: a page read 1543 via the first shape and 1544 via the second, so
 * a drill-down modal reported one more visitor than the row that opened it. Guaranteeing a
 * non-null id makes both shapes agree by construction and honours the "each counts once" rule
 * above, which neither variant did for those rows.
 */
const VISITOR_ID_EXPR = {
  $ifNull: [
    {
      $cond: [
        { $and: [{ $ne: ["$userId", null] }, { $ne: [{ $type: "$userId" }, "missing"] }] },
        { $toString: "$userId" },
        {
          $cond: [
            { $and: [{ $ne: ["$anonymousId", null] }, { $ne: ["$anonymousId", ""] }] },
            "$anonymousId",
            { $concat: ["_noid:", { $toString: "$_id" }] },
          ],
        },
      ],
    },
    { $concat: ["_noid:", { $toString: "$_id" }] },
  ],
};

/**
 * `$match` fragment dating a SIGNUP to when its promo attribution was captured.
 *
 * NOT `createdAt`. Registration writes `signupAttribution` onto PRE-EXISTING plain accounts
 * without touching `createdAt`, so `createdAt` is the age of the ACCOUNT, not the date of the
 * signup event this dashboard counts. A visitor who made an account in June, then arrived via
 * /promotions/dewalt in July and re-registered, was being counted against June — a day on which
 * that page had no traffic at all — while July showed the conversion with no matching signup.
 *
 * Same precedence as `resolveSignupTouchAtMs` (src/utils/payment/payment-processing.ts), which
 * fixed exactly this cohort for purchases in the 2026-07-19 audit, but expressed as an INDEXABLE
 * `$or` rather than `$expr`/`$ifNull` — `$expr` cannot use an index and would turn every signup
 * aggregation on this tab into a full `users` collection scan.
 *
 * ⚠️ Returns a TOP-LEVEL `$or`. Never spread it beside another `$or` in the same object (the
 * channel predicate can produce one) — the second key silently overwrites the first and the date
 * window disappears. Combine with `$and: [signupTouchWindowMatch(...), channelMatch(...)]`.
 */
export function signupTouchWindowMatch(start: Date, end: Date) {
  return {
    $or: [
      { "signupAttribution.visitedAt": { $gte: start, $lte: end } },
      { "signupAttribution.visitedAt": { $exists: false }, createdAt: { $gte: start, $lte: end } },
    ],
  };
}

/**
 * "Did this visitor touch the builder?" as 0/1, for `$sum`/`$max`.
 *
 * `buildInteracted` is authoritative for every row a flag-carrying client wrote. The missing
 * branch falls back to the reel counters rather than assuming engagement — assuming engagement
 * is precisely what made the dropped-flag bug invisible for its whole life.
 *
 * The counters can never be the PRIMARY signal: the cash toggle is not a reel card, so a
 * cash-only visitor sits at 0/0 and genuinely engaged; and a `?toolbox=`/`?toolset=` URL arrival
 * re-hydrates a previously-switched build at 0/0 too. They are only a best-effort read of rows
 * written before the flag worked, all of which age out with the 90-day TTL.
 */
export const BUILD_INTERACTED_FLAG = {
  $cond: [
    { $eq: [{ $type: "$buildInteracted" }, "missing"] },
    {
      $cond: [
        {
          $gt: [
            { $add: [{ $ifNull: ["$toolboxSwitches", 0] }, { $ifNull: ["$toolsetSwitches", 0] }] },
            0,
          ],
        },
        1,
        0,
      ],
    },
    { $cond: ["$buildInteracted", 1, 0] },
  ],
} as const;

/** All valid promotion slugs for aggregation (evergreen + toolset) */
function getAllPromoSlugs(): { pageType: PromoPageType; slug: string }[] {
  const pages: { pageType: PromoPageType; slug: string }[] = [];
  for (const p of listPrizes()) {
    pages.push({ pageType: "evergreen", slug: p.slug });
  }
  for (const s of TOOLSET_LANDING_SLUGS) {
    pages.push({ pageType: "toolset", slug: s });
  }
  return pages;
}

export class PromoAnalyticsRepository {
  async createVisit(data: {
    pageType: PromoPageType;
    slug: string;
    anonymousId?: string;
    referrer?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  }): Promise<void> {
    await connectDB();
    await PromoAnalyticsVisit.create({
      pageType: data.pageType,
      slug: data.slug.toLowerCase().trim(),
      anonymousId: data.anonymousId,
      referrer: data.referrer,
      utmSource: data.utmSource,
      utmMedium: data.utmMedium,
      utmCampaign: data.utmCampaign,
      timestamp: new Date(),
    });
  }

  /**
   * Attach the built prize + engagement counters to a visitor's most recent visit row.
   *
   * `upsert: false` and sorted newest-first: this must NEVER create a row. The visit row is
   * created once on landing; creating another here would double-count visits, which is the one
   * number this whole feature must leave untouched. Returns false when there is nothing to
   * update (dedup race, expired TTL, or a visitor whose landing beacon never landed).
   *
   * `$set` with absolute totals, not `$inc`: the client sends cumulative counts, so a retry or
   * a double flush (debounce + pagehide) is harmless.
   */
  async updateVisitBuild(args: {
    anonymousId: string;
    slug: string;
    pageType: PromoPageType;
    builtPrizeSlug: string;
    toolboxSwitches: number;
    toolsetSwitches: number;
    /**
     * Did the visitor touch either reel or the cash toggle this page-session?
     *
     * REQUIRED. This used to be optional with an "absent means engaged" default
     * (`args.interacted !== false`), and the tracking route dropped it on the way through — so
     * the default fired on 100% of writes and no row has ever carried `false`. Requiring it
     * makes that a compile error. Rows written before this fix are indistinguishable and stay
     * `true`; the read gate is `{ $ne: false }`, so they keep counting as engaged.
     */
    interacted: boolean;
  }): Promise<boolean> {
    await connectDB();
    const result = await PromoAnalyticsVisit.findOneAndUpdate(
      {
        anonymousId: args.anonymousId,
        slug: args.slug.toLowerCase().trim(),
        pageType: args.pageType,
      },
      {
        $set: {
          builtPrizeSlug: args.builtPrizeSlug.toLowerCase().trim(),
          toolboxSwitches: args.toolboxSwitches,
          toolsetSwitches: args.toolsetSwitches,
          buildInteracted: args.interacted,
        },
      },
      { sort: { timestamp: -1 }, new: false, upsert: false }
    )
      .maxTimeMS(5000)
      .lean();
    return result != null;
  }

  async linkVisitToUser(anonymousId: string, userId: string): Promise<number> {
    await connectDB();
    const result = await PromoAnalyticsVisit.updateMany(
      { anonymousId, userId: { $exists: false } },
      { $set: { userId: new mongoose.Types.ObjectId(userId) } }
    );
    return result.modifiedCount;
  }

  async getAggregatedByPage(startDate: Date, endDate: Date): Promise<PromoAnalyticsSummary> {
    await connectDB();

    const allPages = getAllPromoSlugs();
    const byPage: PromoPageMetrics[] = [];

    // 1. Aggregate visits - unique visitors per page (one per user per slug)
    const visitAgg = await PromoAnalyticsVisit.aggregate<
      { _id: { pageType: string; slug: string }; visits: number }
    >([
      { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { pageType: "$pageType", slug: "$slug" }, visitorIds: { $addToSet: VISITOR_ID_EXPR } } },
      { $project: { _id: 1, visits: { $size: "$visitorIds" } } },
    ]).exec();

    const visitMap = new Map<string, number>();
    for (const r of visitAgg) {
      visitMap.set(`${r._id.pageType}:${r._id.slug}`, r.visits);
    }

    // 1b. Prize builds, per page. TWO numbers, deliberately:
    //
    //   buildVisitors — unique visitors who ended on SOME combination (exposure). Every visitor
    //                   to a builder page has one, because the beacon records what was on screen
    //                   whether or not they touched it (F-018) — that is what keeps `builders`
    //                   and `signups` counted over the same population.
    //   builds        — of those, the ones who actually CHANGED something (engagement).
    //
    // The old single `builds` number claimed to be engagement and was gated on
    // `buildInteracted: { $ne: false }`, but the tracking route never forwarded the flag, so no
    // row in production has ever carried `false` and the gate matched everyone. It reported
    // exposure while being labelled, documented and tooltipped as engagement.
    //
    // Both come from ONE ungated `$match` so the two can never be computed over different
    // populations. Engagement is summed via BUILD_INTERACTED_FLAG instead of being filtered in
    // the `$match`, which is what lets a single scan produce both.
    //
    // No `hint` (F-020). One was added believing it avoided a full-window FETCH; measured, it
    // changed nothing — 764 keys / 764 docs examined either way — because the index was
    // non-sparse and `$exists: true` therefore spanned its whole key range. It only added a
    // failure mode, since MongoDB rejects a hint naming an absent index and 500s the route.
    // The index is PARTIAL (`builtPrizeSlug_ts_partial`, F-021) and the planner picks it
    // unprompted: 8 keys / 8 docs examined, so no hint is needed or wanted here.
    const buildMatch = {
      timestamp: { $gte: startDate, $lte: endDate },
      builtPrizeSlug: { $exists: true, $ne: "" },
    };

    // Per (page, combination) — feeds buildDistribution and topBuiltPrize.
    // `$max` makes engagement STICKY per visitor: someone who engaged on one landing and
    // bounced on another is an engaged builder for that combination, not half of one.
    const buildByComboAgg = await PromoAnalyticsVisit.aggregate<{
      _id: { pageType: string; slug: string; builtPrizeSlug: string };
      builders: number;
      interactedBuilders: number;
    }>([
      { $match: buildMatch },
      {
        $group: {
          _id: {
            k: { pageType: "$pageType", slug: "$slug", builtPrizeSlug: "$builtPrizeSlug" },
            v: VISITOR_ID_EXPR,
          },
          interacted: { $max: BUILD_INTERACTED_FLAG },
        },
      },
      {
        $group: {
          _id: "$_id.k",
          builders: { $sum: 1 },
          interactedBuilders: { $sum: "$interacted" },
        },
      },
    ]).exec();

    // Per page — dedupes a visitor ONCE across the whole page.
    //
    // INVARIANT: this is NOT the sum of the per-combination counts above, and must never be
    // derived from them. A visitor who lands twice and settles on a different combination each
    // time is 1 here and 2 there, so `Σ builders ≥ buildVisitors` always. Mixing those two units
    // — summing a distribution for the numerator while dividing by the page-level count — is
    // what once shipped a literal 250% column on this dashboard.
    const buildByPageAgg = await PromoAnalyticsVisit.aggregate<{
      _id: { pageType: string; slug: string };
      buildVisitors: number;
      builds: number;
    }>([
      { $match: buildMatch },
      {
        $group: {
          _id: { k: { pageType: "$pageType", slug: "$slug" }, v: VISITOR_ID_EXPR },
          interacted: { $max: BUILD_INTERACTED_FLAG },
        },
      },
      {
        $group: {
          _id: "$_id.k",
          buildVisitors: { $sum: 1 },
          builds: { $sum: "$interacted" },
        },
      },
    ]).exec();

    const buildPageMap = new Map<string, { buildVisitors: number; builds: number }>();
    for (const r of buildByPageAgg) {
      buildPageMap.set(`${r._id.pageType}:${r._id.slug}`, {
        buildVisitors: r.buildVisitors,
        builds: r.builds,
      });
    }

    const buildDistributionMap = new Map<string, Array<{ builtPrizeSlug: string; visitors: number }>>();
    for (const r of buildByComboAgg) {
      const key = `${r._id.pageType}:${r._id.slug}`;
      const distribution = buildDistributionMap.get(key) ?? [];
      distribution.push({ builtPrizeSlug: r._id.builtPrizeSlug, visitors: r.builders });
      buildDistributionMap.set(key, distribution);
    }
    // Deterministic order: visitors descending, builtPrizeSlug ascending as a tie-break.
    // `topBuiltPrize` below is derived from this same sorted list (single source of truth),
    // so it can no longer disagree with `buildDistribution[0]` on a tie.
    for (const distribution of buildDistributionMap.values()) {
      distribution.sort(
        (a, b) => b.visitors - a.visitors || (a.builtPrizeSlug < b.builtPrizeSlug ? -1 : 1)
      );
    }

    // 2. Aggregate signups from User (signupAttribution.promotionSlug, dated by attribution touch)
    const signupAgg = await User.aggregate<
      { _id: { promotionSlug: string; promotionPageType: string }; signups: number }
    >([
      {
        $match: {
          "signupAttribution.promotionSlug": { $exists: true, $ne: "" },
          ...signupTouchWindowMatch(startDate, endDate),
        },
      },
      {
        $group: {
          _id: {
            promotionSlug: "$signupAttribution.promotionSlug",
            promotionPageType: "$signupAttribution.promotionPageType",
          },
          signups: { $sum: 1 },
        },
      },
    ]).exec();

    const signupMap = new Map<string, number>();
    for (const r of signupAgg) {
      const pageType = (r._id.promotionPageType || getPageTypeFromSlug(r._id.promotionSlug)) as PromoPageType;
      const normalizedSlug = (r._id.promotionSlug ?? "").toLowerCase().trim();
      const key = `${pageType}:${normalizedSlug}`;
      signupMap.set(key, (signupMap.get(key) ?? 0) + r.signups);
    }

    // 3. Aggregate conversions and revenue from PaymentEvent (data.promotionSlug)
    const conversionAgg = await PaymentEvent.aggregate<
      { _id: { slug: string; pageType: string }; conversions: number; revenue: number }
    >([
      {
        $match: {
          eventType: "BenefitsGranted",
          timestamp: { $gte: startDate, $lte: endDate },
          "data.promotionSlug": { $exists: true, $ne: "" },
          $nor: [{ packageType: "membership", "data.billingReason": "subscription_cycle" }],
        },
      },
      ...excludeRefundedBenefitsGrantedStages(),
      {
        $group: {
          _id: {
            slug: "$data.promotionSlug",
            pageType: "$data.promotionPageType",
          },
          conversions: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$data.price", 0] } },
        },
      },
    ]).exec();

    const conversionMap = new Map<string, { conversions: number; revenue: number }>();
    for (const r of conversionAgg) {
      const pageType = (r._id.pageType || getPageTypeFromSlug(r._id.slug)) as PromoPageType;
      const normalizedSlug = (r._id.slug ?? "").toLowerCase().trim();
      const key = `${pageType}:${normalizedSlug}`;
      const existing = conversionMap.get(key);
      conversionMap.set(key, {
        conversions: (existing?.conversions ?? 0) + r.conversions,
        revenue: (existing?.revenue ?? 0) + (r.revenue ?? 0),
      });
    }

    // 4. Build per-page metrics
    let totalVisits = 0;
    let totalSignups = 0;
    let totalConversions = 0;
    let totalRevenue = 0;

    for (const { pageType, slug } of allPages) {
      const key = `${pageType}:${slug}`;
      const visits = visitMap.get(key) ?? 0;
      const build = buildPageMap.get(key);
      const buildVisitors = build?.buildVisitors ?? 0;
      const builds = build?.builds ?? 0;
      const buildDistribution = buildDistributionMap.get(key) ?? [];
      const topBuiltPrize = buildDistribution[0]?.builtPrizeSlug ?? null;
      const signups = signupMap.get(key) ?? 0;
      const conv = conversionMap.get(key);
      const conversions = conv?.conversions ?? 0;
      const revenue = conv?.revenue ?? 0;

      totalVisits += visits;
      totalSignups += signups;
      totalConversions += conversions;
      totalRevenue += revenue;

      const visitToSignupRate = visits > 0 ? (signups / visits) * 100 : 0;
      const signupToConversionRate = signups > 0 ? (conversions / signups) * 100 : 0;
      const overallConversionRate = visits > 0 ? (conversions / visits) * 100 : 0;
      // Share of visitors who saw a combination and changed it. Both operands are page-level
      // uniques from the SAME pipeline, so this cannot exceed 100%.
      const buildChangeRate = buildVisitors > 0 ? (builds / buildVisitors) * 100 : 0;

      byPage.push({
        pageType,
        slug,
        visits,
        buildVisitors,
        builds,
        buildChangeRate,
        topBuiltPrize,
        buildDistribution,
        signups,
        conversions,
        revenue,
        visitToSignupRate,
        signupToConversionRate,
        overallConversionRate,
      });
    }

    return {
      totalVisits,
      totalSignups,
      totalConversions,
      totalRevenue,
      byPage: byPage.sort((a, b) => b.visits - a.visits),
    };
  }

  async getTopPerformingPages(
    startDate: Date,
    endDate: Date,
    limit: number,
    sortBy: "conversionRate" | "signupRate" | "revenue"
  ): Promise<PromoPageMetrics[]> {
    const summary = await this.getAggregatedByPage(startDate, endDate);
    const sorted = [...summary.byPage];
    if (sortBy === "conversionRate") {
      sorted.sort((a, b) => b.overallConversionRate - a.overallConversionRate);
    } else if (sortBy === "signupRate") {
      sorted.sort((a, b) => b.visitToSignupRate - a.visitToSignupRate);
    } else {
      sorted.sort((a, b) => b.revenue - a.revenue);
    }
    return sorted.slice(0, limit);
  }

  /**
   * Aggregate metrics by UTM source (e.g. klaviyo, facebook) for channel attribution.
   * Visits from PromoAnalyticsVisit, signups from User, conversions from PaymentEvent.
   */
  /**
   * Aggregate metrics by acquisition CHANNEL.
   *
   * All three collections are bucketed by the SAME generated `channelKeyExpr`, which is the
   * whole point. They previously used three different rules — `$toLower` grouping for visits
   * here, exact equality against a lowercased value for signups and conversions in the
   * drill-down, and a case-insensitive `$regex` for the drill-down's visits — so a channel
   * stored raw-cased reported traffic with no signups and no revenue. Production carries
   * `Klaviyo` (6,437 visits / 868 signups) and `TIKTOK` (1,399 / 194); both read as zero.
   *
   * The key is a canonical `ConvertingPlatform`, not a raw `utm_source`. That merges the
   * `facebook.com` / `ig` / `fb` forms into one Meta row (matching how ad spend is reported, so
   * ROAS is computable) and splits Klaviyo into Email and SMS by `utm_medium`.
   */
  async getAggregatedByChannel(startDate: Date, endDate: Date): Promise<PromoAnalyticsByChannelSummary> {
    await connectDB();

    const CH_VISIT = channelKeyExpr("$utmSource", "$utmMedium");
    const CH_SIGNUP = channelKeyExpr("$signupAttribution.utmSource", "$signupAttribution.utmMedium");
    const CH_CONV = channelKeyExpr("$data.utmSource", "$data.utmMedium");

    // 1. Visits by channel — unique visitors, deduped ONCE channel-wide.
    const visitAgg = await PromoAnalyticsVisit.aggregate<{ _id: ConvertingPlatform; visits: number }>([
      { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { k: CH_VISIT, v: VISITOR_ID_EXPR } } },
      { $group: { _id: "$_id.k", visits: { $sum: 1 } } },
    ]).exec();

    const visitMap = new Map<string, number>();
    for (const r of visitAgg) visitMap.set(r._id, r.visits);

    // 2. Signups by channel, dated by attribution touch rather than account age.
    const signupAgg = await User.aggregate<{ _id: ConvertingPlatform; signups: number }>([
      {
        $match: {
          "signupAttribution.promotionSlug": { $exists: true, $ne: "" },
          ...signupTouchWindowMatch(startDate, endDate),
        },
      },
      { $group: { _id: CH_SIGNUP, signups: { $sum: 1 } } },
    ]).exec();

    const signupMap = new Map<string, number>();
    for (const r of signupAgg) signupMap.set(r._id, r.signups);

    // 3. Conversions and revenue by channel.
    const conversionAgg = await PaymentEvent.aggregate<{
      _id: ConvertingPlatform;
      conversions: number;
      revenue: number;
    }>([
      {
        $match: {
          eventType: "BenefitsGranted",
          timestamp: { $gte: startDate, $lte: endDate },
          "data.promotionSlug": { $exists: true, $ne: "" },
          $nor: [{ packageType: "membership", "data.billingReason": "subscription_cycle" }],
        },
      },
      ...excludeRefundedBenefitsGrantedStages(),
      {
        $group: {
          _id: CH_CONV,
          conversions: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$data.price", 0] } },
        },
      },
    ]).exec();

    const conversionMap = new Map<string, { conversions: number; revenue: number }>();
    for (const r of conversionAgg) {
      conversionMap.set(r._id, { conversions: r.conversions ?? 0, revenue: r.revenue ?? 0 });
    }

    const allChannels = new Set<string>([
      ...visitMap.keys(),
      ...signupMap.keys(),
      ...conversionMap.keys(),
    ]);

    const byChannel: ChannelMetrics[] = [];
    for (const key of allChannels) {
      const channel = key as ConvertingPlatform;
      const visits = visitMap.get(key) ?? 0;
      const signups = signupMap.get(key) ?? 0;
      const conv = conversionMap.get(key);
      const conversions = conv?.conversions ?? 0;
      const revenue = conv?.revenue ?? 0;

      byChannel.push({
        channel,
        channelLabel: channelLabel(channel),
        visits,
        signups,
        conversions,
        revenue,
        visitToSignupRate: visits > 0 ? (signups / visits) * 100 : 0,
        signupToConversionRate: signups > 0 ? (conversions / signups) * 100 : 0,
        overallConversionRate: visits > 0 ? (conversions / visits) * 100 : 0,
      });
    }

    // Paid channels first (they have spend behind them), then owned, then the catch-alls;
    // signups descending within a tier. Stable regardless of which channels have data.
    byChannel.sort(
      (a, b) => channelOrder(a.channel) - channelOrder(b.channel) || b.signups - a.signups
    );

    return { byChannel };
  }

  /**
   * Aggregate metrics by BUILT PRIZE (e.g. makita-kincrome) across every landing page.
   * Answers: which combinations get built more than they get landed on, and do builders
   * of one combination convert better than builders of another? Visitors from
   * PromoAnalyticsVisit.builtPrizeSlug, signups from User.signupAttribution.builtPrizeSlug,
   * conversions/revenue from PaymentEvent.data.builtPrizeSlug.
   */
  async getAggregatedByBuiltPrize(startDate: Date, endDate: Date): Promise<PromoAnalyticsByBuiltPrizeSummary> {
    await connectDB();

    // 1. Builders - unique visitors who had this combination on screen, on ANY landing page.
    // Deliberately NOT gated on `buildInteracted`: `signups` below counts every visitor whose
    // signup carried this build, including those who never touched the reels, so gating here
    // would divide two different populations and let `builderToSignupRate` exceed 100% (F-018).
    //
    // No `hint` here (F-020). One was added believing it avoided a full-window FETCH; measured,
    // it changed nothing — 764 keys / 764 docs examined either way, because the index is
    // non-sparse and `$exists: true` therefore spans its whole key range. It only added a
    // failure mode: MongoDB rejects a hint naming an index that is not present (fresh deploy
    // before the background build finishes, a restore, a dropped index), which 500s this whole
    // route. Make the index partial before hinting it again.
    const buildAgg = await PromoAnalyticsVisit.aggregate<{ _id: string; builders: number }>(
      [
        {
          $match: {
            timestamp: { $gte: startDate, $lte: endDate },
            builtPrizeSlug: { $exists: true, $ne: "" },
          },
        },
        { $group: { _id: "$builtPrizeSlug", visitorIds: { $addToSet: VISITOR_ID_EXPR } } },
        { $project: { _id: 1, builders: { $size: "$visitorIds" } } },
      ]
    ).exec();

    const buildersMap = new Map<string, number>();
    for (const r of buildAgg) buildersMap.set(r._id, r.builders);

    // 2. Signups from User.signupAttribution.builtPrizeSlug
    const signupAgg = await User.aggregate<{ _id: string; signups: number }>([
      {
        $match: {
          "signupAttribution.builtPrizeSlug": { $exists: true, $ne: "" },
          ...signupTouchWindowMatch(startDate, endDate),
        },
      },
      { $group: { _id: "$signupAttribution.builtPrizeSlug", signups: { $sum: 1 } } },
    ]).exec();

    const signupMap = new Map<string, number>();
    for (const r of signupAgg) signupMap.set(r._id, r.signups);

    // 3. Conversions and revenue from PaymentEvent.data.builtPrizeSlug
    const conversionAgg = await PaymentEvent.aggregate<{
      _id: string;
      conversions: number;
      revenue: number;
    }>([
      {
        $match: {
          eventType: "BenefitsGranted",
          timestamp: { $gte: startDate, $lte: endDate },
          "data.builtPrizeSlug": { $exists: true, $ne: "" },
          $nor: [{ packageType: "membership", "data.billingReason": "subscription_cycle" }],
        },
      },
      ...excludeRefundedBenefitsGrantedStages(),
      {
        $group: {
          _id: "$data.builtPrizeSlug",
          conversions: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$data.price", 0] } },
        },
      },
    ]).exec();

    const conversionMap = new Map<string, { conversions: number; revenue: number }>();
    for (const r of conversionAgg) {
      conversionMap.set(r._id, { conversions: r.conversions ?? 0, revenue: r.revenue ?? 0 });
    }

    // 4. Union of every combination seen anywhere in the range - a combination can have
    // signups/conversions without a builder row in THIS window (built earlier, signed up now).
    const allSlugs = new Set<string>([...buildersMap.keys(), ...signupMap.keys(), ...conversionMap.keys()]);

    const byBuiltPrize: BuiltPrizeMetrics[] = [];
    for (const builtPrizeSlug of allSlugs) {
      const builders = buildersMap.get(builtPrizeSlug) ?? 0;
      const signups = signupMap.get(builtPrizeSlug) ?? 0;
      const conv = conversionMap.get(builtPrizeSlug);
      const conversions = conv?.conversions ?? 0;
      const revenue = conv?.revenue ?? 0;

      byBuiltPrize.push({
        builtPrizeSlug,
        builders,
        signups,
        conversions,
        revenue,
        builderToSignupRate: builders > 0 ? (signups / builders) * 100 : 0,
        signupToConversionRate: signups > 0 ? (conversions / signups) * 100 : 0,
        overallConversionRate: builders > 0 ? (conversions / builders) * 100 : 0,
      });
    }

    // Deterministic order: builders descending, builtPrizeSlug ascending as a tie-break.
    byBuiltPrize.sort((a, b) => b.builders - a.builders || (a.builtPrizeSlug < b.builtPrizeSlug ? -1 : 1));

    return { byBuiltPrize };
  }

  /**
   * Per-page detail: breakdown by (utmSource, utmMedium, utmCampaign).
   * Shows which ads/emails drove traffic to a specific promotion page.
   */
  async getPageDetailByUTMCampaign(
    pageType: PromoPageType,
    slug: string,
    startDate: Date,
    endDate: Date
  ): Promise<PageDetailResult> {
    await connectDB();

    const normalizedSlug = slug.toLowerCase().trim();

    const visitMatch = {
      pageType,
      slug: normalizedSlug,
      timestamp: { $gte: startDate, $lte: endDate },
    };

    // 1. Visits, in ONE scan producing two different dedupes.
    //
    //   pageTotal — visitors deduped ONCE across the whole page. This is `summary.visits`.
    //   byCampaign — visitors deduped per (channel, medium, campaign).
    //
    // These are different numbers and the summary card MUST use the first. It previously
    // summed the per-campaign counts, so a visitor who arrived once from an ad and again
    // directly was counted twice — the modal's "Visits" card read 171 against a parent row of
    // 170 and visibly jumped upward on load, because the modal prefers the server value over
    // the row value it was seeded with.
    const [visitFacet] = await PromoAnalyticsVisit.aggregate<{
      pageTotal: Array<{ visits: number }>;
      byCampaign: Array<{ _id: { ch: ConvertingPlatform; med: string; cmp: string }; visits: number }>;
    }>([
      { $match: visitMatch },
      {
        $facet: {
          pageTotal: [
            { $group: { _id: VISITOR_ID_EXPR } },
            { $count: "visits" },
          ],
          byCampaign: [
            {
              $group: {
                _id: {
                  k: {
                    ch: channelKeyExpr("$utmSource", "$utmMedium"),
                    med: { $toLower: { $ifNull: ["$utmMedium", ""] } },
                    cmp: { $toLower: { $ifNull: ["$utmCampaign", ""] } },
                  },
                  v: VISITOR_ID_EXPR,
                },
              },
            },
            { $group: { _id: "$_id.k", visits: { $sum: 1 } } },
          ],
        },
      },
    ]).exec();

    const visitAgg = (visitFacet?.byCampaign ?? []).map((r) => ({
      _id: { src: r._id.ch as string, med: r._id.med, cmp: r._id.cmp },
      visits: r.visits,
    }));
    const pageVisitTotal = visitFacet?.pageTotal?.[0]?.visits ?? 0;

    // 2. Signups by (utmSource, utmMedium, utmCampaign) from User.signupAttribution
    const signupAgg = await User.aggregate<{
      _id: { src: string; med: string; cmp: string };
      signups: number;
    }>([
      {
        $match: {
          "signupAttribution.promotionSlug": normalizedSlug,
          "signupAttribution.promotionPageType": pageType,
          ...signupTouchWindowMatch(startDate, endDate),
        },
      },
      {
        $group: {
          _id: {
            src: channelKeyExpr("$signupAttribution.utmSource", "$signupAttribution.utmMedium"),
            med: { $toLower: { $ifNull: ["$signupAttribution.utmMedium", ""] } },
            cmp: { $toLower: { $ifNull: ["$signupAttribution.utmCampaign", ""] } },
          },
          signups: { $sum: 1 },
        },
      },
    ]).exec();

    // 3. Conversions/revenue by (utmSource, utmMedium, utmCampaign) from PaymentEvent
    const convAgg = await PaymentEvent.aggregate<{
      _id: { src: string; med: string; cmp: string };
      conversions: number;
      revenue: number;
    }>([
      {
        $match: {
          eventType: "BenefitsGranted",
          timestamp: { $gte: startDate, $lte: endDate },
          "data.promotionSlug": normalizedSlug,
          "data.promotionPageType": pageType,
          $nor: [{ packageType: "membership", "data.billingReason": "subscription_cycle" }],
        },
      },
      ...excludeRefundedBenefitsGrantedStages(),
      {
        $group: {
          _id: {
            src: channelKeyExpr("$data.utmSource", "$data.utmMedium"),
            med: { $toLower: { $ifNull: ["$data.utmMedium", ""] } },
            cmp: { $toLower: { $ifNull: ["$data.utmCampaign", ""] } },
          },
          conversions: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$data.price", 0] } },
        },
      },
    ]).exec();

    // Build composite map (use \u001F delimiter - campaign names can contain |)
    const SEP = "\u001F";
    const toKey = (src: string, med: string, cmp: string) =>
      `${src || "direct"}${SEP}${med || "(none)"}${SEP}${cmp || "(none)"}`;

    const visitMap = new Map<string, number>();
    for (const r of visitAgg) visitMap.set(toKey(r._id.src, r._id.med, r._id.cmp), r.visits);

    const signupMap = new Map<string, number>();
    for (const r of signupAgg) signupMap.set(toKey(r._id.src, r._id.med, r._id.cmp), r.signups);

    const convMap = new Map<string, { conversions: number; revenue: number }>();
    for (const r of convAgg) convMap.set(toKey(r._id.src, r._id.med, r._id.cmp), { conversions: r.conversions, revenue: r.revenue ?? 0 });

    const allKeys = new Set([...visitMap.keys(), ...signupMap.keys(), ...convMap.keys()]);

    // Signups, conversions and revenue DO sum correctly across campaign rows — each account and
    // each payment belongs to exactly one campaign. Only visits need the separate page-level
    // dedupe above, because one visitor can appear under several campaigns.
    let totalSignups = 0;
    let totalConversions = 0;
    let totalRevenue = 0;
    const byCampaign: UTMCampaignMetrics[] = [];

    for (const key of allKeys) {
      const parts = key.split(SEP);
      const src = parts[0] ?? "direct";
      const med = parts[1] ?? "(none)";
      const cmp = parts[2] ?? "(none)";
      const visits = visitMap.get(key) ?? 0;
      const signups = signupMap.get(key) ?? 0;
      const conv = convMap.get(key);
      const conversions = conv?.conversions ?? 0;
      const revenue = conv?.revenue ?? 0;

      totalSignups += signups;
      totalConversions += conversions;
      totalRevenue += revenue;

      const channel = src as ConvertingPlatform;

      byCampaign.push({
        channel,
        channelLabel: channelLabel(channel),
        utmMedium: med,
        utmCampaign: cmp,
        visits,
        signups,
        conversions,
        revenue,
        visitToSignupRate: visits > 0 ? (signups / visits) * 100 : 0,
        signupToConversionRate: signups > 0 ? (conversions / signups) * 100 : 0,
        overallConversionRate: visits > 0 ? (conversions / visits) * 100 : 0,
      });
    }

    byCampaign.sort((a, b) => b.visits - a.visits);

    // 4. Prize builds for this page. Composed here rather than by the service so the summary and
    // the breakdown are guaranteed to come from one date window and one page filter.
    const buildBreakdown = await this.getPageBuildBreakdown(pageType, normalizedSlug, startDate, endDate);

    return {
      pageType,
      slug: normalizedSlug,
      pageLabel: getPrizeLabel(normalizedSlug) ?? normalizedSlug,
      summary: {
        // Page-level dedupe, NOT the sum of byCampaign[].visits — see the $facet above.
        visits: pageVisitTotal,
        signups: totalSignups,
        conversions: totalConversions,
        revenue: totalRevenue,
      },
      byCampaign,
      buildBreakdown,
    };
  }

  /**
   * Aggregate by TOOLBOX lane, deduped in Mongo.
   *
   * This used to be computed in the browser by summing `byBuiltPrize[].builders` per toolbox.
   * Those are uniques deduped PER COMBINATION, so a visitor who ended on `makita-kincrome` on
   * one landing and `ryobi-kincrome` on another counted as two Kincrome builders — while the
   * `signups` divided into that sum are globally unique. The result understated every toolbox
   * rate, worst for the toolbox that is the default on the most pages. It is the same
   * numerator/denominator unit mismatch that once shipped a literal 250% column here.
   *
   * Deduping on `(toolbox, visitor)` in the pipeline makes that impossible by construction.
   */
  async getAggregatedByToolbox(
    startDate: Date,
    endDate: Date
  ): Promise<{ byToolbox: ToolboxMetrics[] }> {
    await connectDB();

    // `$switch` over the lane registry. Anything unrecognised — notably `cash-prize`, which has
    // no toolbox lane — resolves to null and is dropped, never bucketed somewhere plausible.
    const laneOf = (field: string) => ({
      $switch: {
        branches: PRIZE_LANE_SLUGS.map(({ slug, toolbox }) => ({
          case: { $eq: [field, slug] },
          then: toolbox,
        })),
        default: null,
      },
    });
    const LANE_SLUGS = PRIZE_LANE_SLUGS.map((l) => l.slug);

    const [builderAgg, signupAgg, convAgg] = await Promise.all([
      PromoAnalyticsVisit.aggregate<{ _id: string; builders: number; interactedBuilders: number }>([
        { $match: { timestamp: { $gte: startDate, $lte: endDate }, builtPrizeSlug: { $in: LANE_SLUGS } } },
        { $addFields: { _toolbox: laneOf("$builtPrizeSlug") } },
        {
          $group: {
            _id: { k: "$_toolbox", v: VISITOR_ID_EXPR },
            interacted: { $max: BUILD_INTERACTED_FLAG },
          },
        },
        {
          $group: {
            _id: "$_id.k",
            builders: { $sum: 1 },
            interactedBuilders: { $sum: "$interacted" },
          },
        },
      ]).exec(),

      User.aggregate<{ _id: string; signups: number }>([
        {
          $match: {
            "signupAttribution.builtPrizeSlug": { $in: LANE_SLUGS },
            ...signupTouchWindowMatch(startDate, endDate),
          },
        },
        { $addFields: { _toolbox: laneOf("$signupAttribution.builtPrizeSlug") } },
        { $group: { _id: "$_toolbox", signups: { $sum: 1 } } },
      ]).exec(),

      PaymentEvent.aggregate<{ _id: string; conversions: number; revenue: number }>([
        {
          $match: {
            eventType: "BenefitsGranted",
            timestamp: { $gte: startDate, $lte: endDate },
            "data.builtPrizeSlug": { $in: LANE_SLUGS },
            $nor: [{ packageType: "membership", "data.billingReason": "subscription_cycle" }],
          },
        },
        ...excludeRefundedBenefitsGrantedStages(),
        { $addFields: { _toolbox: laneOf("$data.builtPrizeSlug") } },
        {
          $group: {
            _id: "$_toolbox",
            conversions: { $sum: 1 },
            revenue: { $sum: { $ifNull: ["$data.price", 0] } },
          },
        },
      ]).exec(),
    ]);

    const builderMap = new Map(builderAgg.filter((r) => r._id).map((r) => [r._id, r]));
    const signupMap = new Map(signupAgg.filter((r) => r._id).map((r) => [r._id, r.signups]));
    const convMap = new Map(convAgg.filter((r) => r._id).map((r) => [r._id, r]));

    const byToolbox: ToolboxMetrics[] = [];
    for (const toolboxId of new Set([...builderMap.keys(), ...signupMap.keys(), ...convMap.keys()])) {
      const b = builderMap.get(toolboxId);
      const builders = b?.builders ?? 0;
      const signups = signupMap.get(toolboxId) ?? 0;
      const c = convMap.get(toolboxId);
      const conversions = c?.conversions ?? 0;
      byToolbox.push({
        toolboxId,
        builders,
        interactedBuilders: b?.interactedBuilders ?? 0,
        signups,
        conversions,
        revenue: c?.revenue ?? 0,
        // Recomputed from the SUMMED totals, never averaged from per-combination rates — an
        // average would weight a 1-builder combination the same as a 100-builder one.
        builderToSignupRate: builders > 0 ? (signups / builders) * 100 : 0,
        signupToConversionRate: signups > 0 ? (conversions / signups) * 100 : 0,
        overallConversionRate: builders > 0 ? (conversions / builders) * 100 : 0,
      });
    }

    byToolbox.sort((a, b) => b.builders - a.builders || a.toolboxId.localeCompare(b.toolboxId));
    return { byToolbox };
  }

  /**
   * Per-page prize-build breakdown: which combination each visitor ended on, how many changed
   * it, and how each combination converted.
   *
   * Page-scoped twin of `getAggregatedByBuiltPrize`, using the SAME pipeline shape as the
   * per-page rollup in `getAggregatedByPage`, so the modal and the table row cannot disagree.
   */
  async getPageBuildBreakdown(
    pageType: PromoPageType,
    slug: string,
    startDate: Date,
    endDate: Date
  ): Promise<PageBuildBreakdown> {
    await connectDB();

    const normalizedSlug = slug.toLowerCase().trim();
    const defaultBuiltPrizeSlug = getPageDefaultPrizeSlug(normalizedSlug);

    const buildMatch = {
      pageType,
      slug: normalizedSlug,
      timestamp: { $gte: startDate, $lte: endDate },
      builtPrizeSlug: { $exists: true, $ne: "" },
    };

    const [byComboAgg, pageAgg, signupAgg, convAgg] = await Promise.all([
      PromoAnalyticsVisit.aggregate<{
        _id: string;
        builders: number;
        interactedBuilders: number;
      }>([
        { $match: buildMatch },
        {
          $group: {
            _id: { k: "$builtPrizeSlug", v: VISITOR_ID_EXPR },
            interacted: { $max: BUILD_INTERACTED_FLAG },
          },
        },
        {
          $group: {
            _id: "$_id.k",
            builders: { $sum: 1 },
            interactedBuilders: { $sum: "$interacted" },
          },
        },
      ]).exec(),

      PromoAnalyticsVisit.aggregate<{ _id: null; buildVisitors: number; builds: number }>([
        { $match: buildMatch },
        {
          $group: {
            _id: VISITOR_ID_EXPR,
            interacted: { $max: BUILD_INTERACTED_FLAG },
          },
        },
        {
          $group: {
            _id: null,
            buildVisitors: { $sum: 1 },
            builds: { $sum: "$interacted" },
          },
        },
      ]).exec(),

      User.aggregate<{ _id: string; signups: number }>([
        {
          $match: {
            "signupAttribution.promotionSlug": normalizedSlug,
            "signupAttribution.promotionPageType": pageType,
            "signupAttribution.builtPrizeSlug": { $exists: true, $ne: "" },
            ...signupTouchWindowMatch(startDate, endDate),
          },
        },
        { $group: { _id: "$signupAttribution.builtPrizeSlug", signups: { $sum: 1 } } },
      ]).exec(),

      PaymentEvent.aggregate<{ _id: string; conversions: number; revenue: number }>([
        {
          $match: {
            eventType: "BenefitsGranted",
            timestamp: { $gte: startDate, $lte: endDate },
            "data.promotionSlug": normalizedSlug,
            "data.promotionPageType": pageType,
            "data.builtPrizeSlug": { $exists: true, $ne: "" },
            $nor: [{ packageType: "membership", "data.billingReason": "subscription_cycle" }],
          },
        },
        ...excludeRefundedBenefitsGrantedStages(),
        {
          $group: {
            _id: "$data.builtPrizeSlug",
            conversions: { $sum: 1 },
            revenue: { $sum: { $ifNull: ["$data.price", 0] } },
          },
        },
      ]).exec(),
    ]);

    const builderMap = new Map(byComboAgg.map((r) => [r._id, r]));
    const signupMap = new Map(signupAgg.map((r) => [r._id, r.signups]));
    const convMap = new Map(convAgg.map((r) => [r._id, r]));

    // Always include the page's own default, even at zero. "Nobody ended on the combination this
    // page leads with" is the single most useful thing this table can say, and an absent row
    // would silently read as "no data" instead.
    const allSlugs = new Set<string>([
      defaultBuiltPrizeSlug,
      ...builderMap.keys(),
      ...signupMap.keys(),
      ...convMap.keys(),
    ]);

    const byBuild: PrizeBuildMetrics[] = [];
    for (const builtPrizeSlug of allSlugs) {
      const b = builderMap.get(builtPrizeSlug);
      const builders = b?.builders ?? 0;
      const interactedBuilders = b?.interactedBuilders ?? 0;
      const signups = signupMap.get(builtPrizeSlug) ?? 0;
      const c = convMap.get(builtPrizeSlug);
      const conversions = c?.conversions ?? 0;
      const revenue = c?.revenue ?? 0;

      byBuild.push({
        builtPrizeSlug,
        builders,
        interactedBuilders,
        signups,
        conversions,
        revenue,
        builderToSignupRate: builders > 0 ? (signups / builders) * 100 : 0,
        signupToConversionRate: signups > 0 ? (conversions / signups) * 100 : 0,
        overallConversionRate: builders > 0 ? (conversions / builders) * 100 : 0,
        isPageDefault: builtPrizeSlug === defaultBuiltPrizeSlug,
      });
    }

    byBuild.sort(
      (a, b) => b.builders - a.builders || (a.builtPrizeSlug < b.builtPrizeSlug ? -1 : 1)
    );

    const buildVisitors = pageAgg[0]?.buildVisitors ?? 0;
    const builds = pageAgg[0]?.builds ?? 0;

    return {
      defaultBuiltPrizeSlug,
      buildVisitors,
      builds,
      buildChangeRate: buildVisitors > 0 ? (builds / buildVisitors) * 100 : 0,
      byBuild,
    };
  }

  /**
   * Channel detail: which pages received traffic from a specific UTM source,
   * plus breakdown by campaign within that source.
   */
  async getChannelDetail(
    channel: ConvertingPlatform,
    startDate: Date,
    endDate: Date
  ): Promise<ChannelDetailResult> {
    await connectDB();

    // ONE generated predicate for all three collections. This replaces a hand-written
    // `sourceMatch` that used exact equality against a lowercased value for signups and
    // conversions while visits used a case-insensitive `new RegExp("^" + src + "$", "i")` —
    // so a channel stored raw-cased (production carries `Klaviyo` and `TIKTOK`) matched on the
    // visits leg and matched NOTHING on the other two, reporting real traffic with 0 signups,
    // 0 conversions and $0 revenue. It also removes both RegExp constructions, which were built
    // from a `utm_source` any visitor could put in the URL.
    const visitWhere = channelMatch("$utmSource", "$utmMedium", channel);
    const signupWhere = channelMatch(
      "$signupAttribution.utmSource",
      "$signupAttribution.utmMedium",
      channel
    );
    const convWhere = channelMatch("$data.utmSource", "$data.utmMedium", channel);

    // ── Visits: one scan, four different dedupes ──
    //
    // `total` is the channel-wide dedupe and is what `summary.visits` must use. Summing
    // `byPage` instead counted a visitor once per page they saw, so the modal's card read
    // above the row that opened it (the owner's screenshot: row 170, card 171) and visibly
    // jumped on load, because the modal prefers the server value over its seeded row value.
    const [visitFacet] = await PromoAnalyticsVisit.aggregate<{
      total: Array<{ visits: number }>;
      byPage: Array<{ _id: { pageType: string; slug: string }; visits: number }>;
      byCampaign: Array<{ _id: { cmp: string; med: string }; visits: number }>;
      rawSources: Array<{ _id: string; visits: number }>;
    }>([
      { $match: { timestamp: { $gte: startDate, $lte: endDate }, ...visitWhere } },
      {
        $facet: {
          total: [{ $group: { _id: VISITOR_ID_EXPR } }, { $count: "visits" }],
          byPage: [
            { $group: { _id: { k: { pageType: "$pageType", slug: "$slug" }, v: VISITOR_ID_EXPR } } },
            { $group: { _id: "$_id.k", visits: { $sum: 1 } } },
          ],
          byCampaign: [
            {
              $group: {
                _id: {
                  k: {
                    cmp: { $toLower: { $ifNull: ["$utmCampaign", ""] } },
                    med: { $toLower: { $ifNull: ["$utmMedium", ""] } },
                  },
                  v: VISITOR_ID_EXPR,
                },
              },
            },
            { $group: { _id: "$_id.k", visits: { $sum: 1 } } },
          ],
          // Auditability for the fold — "what actually merged into Facebook / Instagram?".
          // PER-SOURCE uniques: one visitor can arrive via `ig` and later `facebook.com`, so
          // these MAY sum above `total`. Never render them as an addend.
          rawSources: [
            {
              $group: {
                _id: { k: { $toLower: { $ifNull: ["$utmSource", ""] } }, v: VISITOR_ID_EXPR },
              },
            },
            { $group: { _id: "$_id.k", visits: { $sum: 1 } } },
            { $sort: { visits: -1 } },
            { $limit: 20 },
          ],
        },
      },
    ]).exec();

    const visitByPageAgg = visitFacet?.byPage ?? [];
    const channelVisitTotal = visitFacet?.total?.[0]?.visits ?? 0;

    const signupByPageAgg = await User.aggregate<{
      _id: { pageType: string; slug: string }; signups: number;
    }>([
      {
        $match: {
          "signupAttribution.promotionSlug": { $exists: true, $ne: "" },
          // $and, NOT a spread: signupTouchWindowMatch returns a top-level $or, and channelMatch
          // returns a top-level $expr. Spreading both into one object is safe today, but $and
          // makes the combination explicit and survives either helper gaining an $or.
          $and: [signupTouchWindowMatch(startDate, endDate), signupWhere],
        },
      },
      {
        $group: {
          _id: {
            pageType: { $ifNull: ["$signupAttribution.promotionPageType", "evergreen"] },
            slug: "$signupAttribution.promotionSlug",
          },
          signups: { $sum: 1 },
        },
      },
    ]).exec();

    const convByPageAgg = await PaymentEvent.aggregate<{
      _id: { pageType: string; slug: string }; conversions: number; revenue: number;
    }>([
      {
        $match: {
          eventType: "BenefitsGranted",
          timestamp: { $gte: startDate, $lte: endDate },
          "data.promotionSlug": { $exists: true, $ne: "" },
          $nor: [{ packageType: "membership", "data.billingReason": "subscription_cycle" }],
          ...convWhere,
        },
      },
      ...excludeRefundedBenefitsGrantedStages(),
      {
        $group: {
          _id: { pageType: { $ifNull: ["$data.promotionPageType", "evergreen"] }, slug: "$data.promotionSlug" },
          conversions: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$data.price", 0] } },
        },
      },
    ]).exec();

    const pageVisitMap = new Map<string, number>();
    for (const r of visitByPageAgg) pageVisitMap.set(`${r._id.pageType}:${r._id.slug}`, r.visits);

    const pageSignupMap = new Map<string, number>();
    for (const r of signupByPageAgg) pageSignupMap.set(`${r._id.pageType}:${r._id.slug}`, r.signups);

    const pageConvMap = new Map<string, { conversions: number; revenue: number }>();
    for (const r of convByPageAgg) pageConvMap.set(`${r._id.pageType}:${r._id.slug}`, { conversions: r.conversions, revenue: r.revenue ?? 0 });

    const allPageKeys = new Set([...pageVisitMap.keys(), ...pageSignupMap.keys(), ...pageConvMap.keys()]);
    const byPage: ChannelPageMetrics[] = [];
    let totalSignups = 0;
    let totalConversions = 0;
    let totalRevenue = 0;

    for (const key of allPageKeys) {
      const [pt, sl] = key.split(":");
      const visits = pageVisitMap.get(key) ?? 0;
      const signups = pageSignupMap.get(key) ?? 0;
      const conv = pageConvMap.get(key);
      const conversions = conv?.conversions ?? 0;
      const revenue = conv?.revenue ?? 0;

      totalSignups += signups;
      totalConversions += conversions;
      totalRevenue += revenue;

      byPage.push({
        pageType: pt as PromoPageType,
        slug: sl,
        pageLabel: getPrizeLabel(sl) ?? sl,
        visits,
        signups,
        conversions,
        revenue,
        visitToSignupRate: visits > 0 ? (signups / visits) * 100 : 0,
        signupToConversionRate: signups > 0 ? (conversions / signups) * 100 : 0,
        overallConversionRate: visits > 0 ? (conversions / visits) * 100 : 0,
      });
    }

    byPage.sort((a, b) => b.visits - a.visits);

    // ── By Campaign ──

    // Already computed by the single visit `$facet` above — this used to be a third full scan
    // of the same rows with the same predicate.
    const visitByCampAgg = visitFacet?.byCampaign ?? [];

    const signupByCampAgg = await User.aggregate<{
      _id: { cmp: string; med: string }; signups: number;
    }>([
      {
        $match: {
          "signupAttribution.promotionSlug": { $exists: true, $ne: "" },
          $and: [signupTouchWindowMatch(startDate, endDate), signupWhere],
        },
      },
      {
        $group: {
          _id: {
            cmp: { $toLower: { $ifNull: ["$signupAttribution.utmCampaign", ""] } },
            med: { $toLower: { $ifNull: ["$signupAttribution.utmMedium", ""] } },
          },
          signups: { $sum: 1 },
        },
      },
    ]).exec();

    const convByCampAgg = await PaymentEvent.aggregate<{
      _id: { cmp: string; med: string }; conversions: number; revenue: number;
    }>([
      {
        $match: {
          eventType: "BenefitsGranted",
          timestamp: { $gte: startDate, $lte: endDate },
          "data.promotionSlug": { $exists: true, $ne: "" },
          $nor: [{ packageType: "membership", "data.billingReason": "subscription_cycle" }],
          ...convWhere,
        },
      },
      ...excludeRefundedBenefitsGrantedStages(),
      {
        $group: {
          _id: {
            cmp: { $toLower: { $ifNull: ["$data.utmCampaign", ""] } },
            med: { $toLower: { $ifNull: ["$data.utmMedium", ""] } },
          },
          conversions: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$data.price", 0] } },
        },
      },
    ]).exec();

    const CAMP_SEP = "\u001F";
    const campKey = (cmp: string, med: string) => `${cmp || "(none)"}${CAMP_SEP}${med || "(none)"}`;

    const campVisitMap = new Map<string, number>();
    for (const r of visitByCampAgg) campVisitMap.set(campKey(r._id.cmp, r._id.med), r.visits);

    const campSignupMap = new Map<string, number>();
    for (const r of signupByCampAgg) campSignupMap.set(campKey(r._id.cmp, r._id.med), r.signups);

    const campConvMap = new Map<string, { conversions: number; revenue: number }>();
    for (const r of convByCampAgg) campConvMap.set(campKey(r._id.cmp, r._id.med), { conversions: r.conversions, revenue: r.revenue ?? 0 });

    const allCampKeys = new Set([...campVisitMap.keys(), ...campSignupMap.keys(), ...campConvMap.keys()]);
    const byCampaign: ChannelCampaignMetrics[] = [];

    for (const key of allCampKeys) {
      const campParts = key.split(CAMP_SEP);
      const cmp = campParts[0] ?? "(none)";
      const med = campParts[1] ?? "(none)";
      const visits = campVisitMap.get(key) ?? 0;
      const signups = campSignupMap.get(key) ?? 0;
      const conv = campConvMap.get(key);
      const conversions = conv?.conversions ?? 0;
      const revenue = conv?.revenue ?? 0;

      byCampaign.push({
        utmCampaign: cmp,
        utmMedium: med,
        visits,
        signups,
        conversions,
        revenue,
        visitToSignupRate: visits > 0 ? (signups / visits) * 100 : 0,
        signupToConversionRate: signups > 0 ? (conversions / signups) * 100 : 0,
        overallConversionRate: visits > 0 ? (conversions / visits) * 100 : 0,
      });
    }

    byCampaign.sort((a, b) => b.visits - a.visits);

    const rawSources: ChannelRawSource[] = (visitFacet?.rawSources ?? []).map((r) => ({
      source: r._id === "" ? "(none)" : r._id,
      visits: r.visits,
    }));

    return {
      channel,
      channelLabel: channelLabel(channel),
      summary: {
        // Channel-wide dedupe, NOT the sum of byPage[].visits — see the $facet above.
        visits: channelVisitTotal,
        signups: totalSignups,
        conversions: totalConversions,
        revenue: totalRevenue,
      },
      byPage,
      byCampaign,
      rawSources,
    };
  }
}

const promoAnalyticsRepository = new PromoAnalyticsRepository();
export default promoAnalyticsRepository;
