import connectDB from "@/lib/mongodb";
import PromoAnalyticsVisit from "@/models/PromoAnalyticsVisit";
import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import { excludeRefundedBenefitsGrantedStages } from "@/utils/payment/payment-event-net-queries";
import { listPrizes, getPrizeLabel } from "@/config/prizes";
import { TOOLSET_LANDING_SLUGS } from "@/config/promo-landing-slugs";
import { getPageTypeFromSlug } from "@/utils/promo-analytics/validate-promo-slug";
import mongoose from "mongoose";
import type { PromoPageType } from "@/models/PromoAnalyticsVisit";
import type {
  UTMCampaignMetrics,
  PageDetailResult,
  ChannelPageMetrics,
  ChannelCampaignMetrics,
  ChannelDetailResult,
} from "@/types/promo-analytics";

export interface PromoPageMetrics {
  pageType: PromoPageType;
  slug: string;
  visits: number;
  crossVisits: number;
  /** Unique visitors who assembled a prize on this page (touched at least one reel). */
  builds: number;
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

export interface UTMSourceMetrics {
  utmSource: string;
  visits: number;
  signups: number;
  conversions: number;
  revenue: number;
  visitToSignupRate: number;
  signupToConversionRate: number;
  overallConversionRate: number;
}

export interface PromoAnalyticsByUTMSummary {
  byUTMSource: UTMSourceMetrics[];
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

export interface PromoAnalyticsByBuiltPrizeSummary {
  byBuiltPrize: BuiltPrizeMetrics[];
}

/**
 * Visitor identity for dedup: userId if set, else anonymousId.
 * No-id visits get unique placeholder so each counts once (can't dedup unknown visitors).
 */
const VISITOR_ID_EXPR = {
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
};

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
    referrerSlug?: string;
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
      referrerSlug: data.referrerSlug?.toLowerCase().trim(),
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
    /** Absent means engaged — pre-flag callers and legacy rows are counted as engaged. */
    interacted?: boolean;
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
          buildInteracted: args.interacted !== false,
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

    // 1b. Aggregate cross-visits - unique visitors who came from another toolset
    const crossVisitAgg = await PromoAnalyticsVisit.aggregate<
      { _id: { pageType: string; slug: string }; crossVisits: number }
    >([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
          referrerSlug: { $exists: true, $ne: "" },
        },
      },
      {
        $group: {
          _id: { pageType: "$pageType", slug: "$slug" },
          visitorIds: { $addToSet: VISITOR_ID_EXPR },
        },
      },
      { $project: { _id: 1, crossVisits: { $size: "$visitorIds" } } },
    ]).exec();

    const crossVisitMap = new Map<string, number>();
    for (const r of crossVisitAgg) {
      crossVisitMap.set(`${r._id.pageType}:${r._id.slug}`, r.crossVisits);
    }

    // 1c. Built-prize engagement - unique visitors who actually ENGAGED with the builder, plus
    // the most-built combination per landing page.
    //
    // Gated on `buildInteracted`, not on the presence of `builtPrizeSlug`: every visitor now
    // carries a `builtPrizeSlug` (it records what was on screen, which is what makes the
    // built-prize funnel's builders and signups countable on the same population — F-018), so
    // the field's presence no longer distinguishes "engaged" from "just landed". Rows written
    // before that change have no `buildInteracted` and were only ever written for engaged
    // visitors, so treating a missing flag as engaged keeps historic pages comparable.
    // No `hint` (F-020). One was added believing it avoided a full-window FETCH; measured, it
    // changed nothing — 764 keys / 764 docs examined either way — because the index was
    // non-sparse and `$exists: true` therefore spanned its whole key range. It only added a
    // failure mode, since MongoDB rejects a hint naming an absent index and 500s the route.
    // The index is now PARTIAL (`builtPrizeSlug_ts_partial`, F-021) and the planner picks it
    // unprompted: 8 keys / 8 docs examined, so no hint is needed or wanted here.
    const buildAgg = await PromoAnalyticsVisit.aggregate<
      { _id: { pageType: string; slug: string; builtPrizeSlug: string }; visitorIds: string[] }
    >(
      [
        {
          $match: {
            timestamp: { $gte: startDate, $lte: endDate },
            builtPrizeSlug: { $exists: true, $ne: "" },
            // `$ne: false` (not `true`) so legacy rows, which predate the flag, still count.
            buildInteracted: { $ne: false },
          },
        },
        {
          $group: {
            _id: { pageType: "$pageType", slug: "$slug", builtPrizeSlug: "$builtPrizeSlug" },
            visitorIds: { $addToSet: VISITOR_ID_EXPR },
          },
        },
      ]
    ).exec();

    const buildVisitorIds = new Map<string, Set<string>>();
    const buildDistributionMap = new Map<string, Array<{ builtPrizeSlug: string; visitors: number }>>();
    for (const r of buildAgg) {
      const key = `${r._id.pageType}:${r._id.slug}`;
      const ids = buildVisitorIds.get(key) ?? new Set<string>();
      for (const id of r.visitorIds) ids.add(id);
      buildVisitorIds.set(key, ids);

      const distribution = buildDistributionMap.get(key) ?? [];
      distribution.push({ builtPrizeSlug: r._id.builtPrizeSlug, visitors: r.visitorIds.length });
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

    // 2. Aggregate signups from User (signupAttribution.promotionSlug + createdAt)
    const signupAgg = await User.aggregate<
      { _id: { promotionSlug: string; promotionPageType: string }; signups: number }
    >([
      {
        $match: {
          "signupAttribution.promotionSlug": { $exists: true, $ne: "" },
          createdAt: { $gte: startDate, $lte: endDate },
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
      const crossVisits = crossVisitMap.get(key) ?? 0;
      const builds = buildVisitorIds.get(key)?.size ?? 0;
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

      byPage.push({
        pageType,
        slug,
        visits,
        crossVisits,
        builds,
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
  async getAggregatedByUTMSource(startDate: Date, endDate: Date): Promise<PromoAnalyticsByUTMSummary> {
    await connectDB();

    // 1. Visits by utmSource (PromoAnalyticsVisit) - empty/null -> "direct"
    const visitAgg = await PromoAnalyticsVisit.aggregate<
      { _id: string; visits: number }
    >([
      { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
      {
        $addFields: {
          _utmKey: {
            $cond: {
              if: { $or: [{ $eq: ["$utmSource", null] }, { $eq: ["$utmSource", ""] }] },
              then: "direct",
              else: { $toLower: { $ifNull: ["$utmSource", ""] } },
            },
          },
        },
      },
      { $match: { _utmKey: { $ne: "" } } },
      { $group: { _id: "$_utmKey", visitorIds: { $addToSet: VISITOR_ID_EXPR } } },
      { $project: { _id: 1, visits: { $size: "$visitorIds" } } },
    ]).exec();

    const visitMap = new Map<string, number>();
    for (const r of visitAgg) {
      const key = r._id || "direct";
      visitMap.set(key, r.visits);
    }

    // 2. Signups by utmSource (User.signupAttribution.utmSource)
    const signupAgg = await User.aggregate<
      { _id: string; signups: number }
    >([
      {
        $match: {
          "signupAttribution.promotionSlug": { $exists: true, $ne: "" },
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $addFields: {
          _utmKey: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$signupAttribution.utmSource", null] },
                  { $eq: ["$signupAttribution.utmSource", ""] },
                ],
              },
              then: "direct",
              else: { $toLower: { $ifNull: ["$signupAttribution.utmSource", ""] } },
            },
          },
        },
      },
      { $match: { _utmKey: { $ne: "" } } },
      { $group: { _id: "$_utmKey", signups: { $sum: 1 } } },
    ]).exec();

    const signupMap = new Map<string, number>();
    for (const r of signupAgg) {
      const key = r._id || "direct";
      signupMap.set(key, r.signups);
    }

    // 3. Conversions and revenue by utmSource (PaymentEvent.data.utmSource)
    const conversionAgg = await PaymentEvent.aggregate<
      { _id: string; conversions: number; revenue: number }
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
        $addFields: {
          _utmKey: {
            $cond: {
              if: { $or: [{ $eq: ["$data.utmSource", null] }, { $eq: ["$data.utmSource", ""] }] },
              then: "direct",
              else: { $toLower: { $ifNull: ["$data.utmSource", ""] } },
            },
          },
        },
      },
      { $match: { _utmKey: { $ne: "" } } },
      {
        $group: {
          _id: "$_utmKey",
          conversions: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$data.price", 0] } },
        },
      },
    ]).exec();

    const conversionMap = new Map<string, { conversions: number; revenue: number }>();
    for (const r of conversionAgg) {
      const key = r._id || "direct";
      conversionMap.set(key, {
        conversions: r.conversions ?? 0,
        revenue: r.revenue ?? 0,
      });
    }

    // Collect all UTM sources
    const allSources = new Set<string>([
      ...visitMap.keys(),
      ...signupMap.keys(),
      ...conversionMap.keys(),
    ]);

    const byUTMSource: UTMSourceMetrics[] = [];
    for (const source of allSources) {
      const visits = visitMap.get(source) ?? 0;
      const signups = signupMap.get(source) ?? 0;
      const conv = conversionMap.get(source);
      const conversions = conv?.conversions ?? 0;
      const revenue = conv?.revenue ?? 0;

      const visitToSignupRate = visits > 0 ? (signups / visits) * 100 : 0;
      const signupToConversionRate = signups > 0 ? (conversions / signups) * 100 : 0;
      const overallConversionRate = visits > 0 ? (conversions / visits) * 100 : 0;

      byUTMSource.push({
        utmSource: source === "direct" ? "Direct" : source.charAt(0).toUpperCase() + source.slice(1),
        visits,
        signups,
        conversions,
        revenue,
        visitToSignupRate,
        signupToConversionRate,
        overallConversionRate,
      });
    }

    // Sort by signups descending (most impactful channels first)
    byUTMSource.sort((a, b) => b.signups - a.signups);

    return { byUTMSource };
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
          createdAt: { $gte: startDate, $lte: endDate },
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

    // 1. Visits by (utmSource, utmMedium, utmCampaign) - unique visitors
    const visitAgg = await PromoAnalyticsVisit.aggregate<{
      _id: { src: string; med: string; cmp: string };
      visits: number;
    }>([
      { $match: { pageType, slug: normalizedSlug, timestamp: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: {
            src: { $toLower: { $ifNull: ["$utmSource", ""] } },
            med: { $toLower: { $ifNull: ["$utmMedium", ""] } },
            cmp: { $toLower: { $ifNull: ["$utmCampaign", ""] } },
          },
          visitorIds: { $addToSet: VISITOR_ID_EXPR },
        },
      },
      { $project: { _id: 1, visits: { $size: "$visitorIds" } } },
    ]).exec();

    // 2. Signups by (utmSource, utmMedium, utmCampaign) from User.signupAttribution
    const signupAgg = await User.aggregate<{
      _id: { src: string; med: string; cmp: string };
      signups: number;
    }>([
      {
        $match: {
          "signupAttribution.promotionSlug": normalizedSlug,
          "signupAttribution.promotionPageType": pageType,
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            src: { $toLower: { $ifNull: ["$signupAttribution.utmSource", ""] } },
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
            src: { $toLower: { $ifNull: ["$data.utmSource", ""] } },
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

    let totalVisits = 0;
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

      totalVisits += visits;
      totalSignups += signups;
      totalConversions += conversions;
      totalRevenue += revenue;

      const displaySource = src === "direct" ? "Direct" : src.charAt(0).toUpperCase() + src.slice(1);

      byCampaign.push({
        utmSource: displaySource,
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

    // 4. Visits from other toolset pages (referrerSlug breakdown) - unique visitors per referrer
    const visitsFromAgg = await PromoAnalyticsVisit.aggregate<
      { _id: string; visits: number }
    >([
      {
        $match: {
          pageType,
          slug: normalizedSlug,
          timestamp: { $gte: startDate, $lte: endDate },
          referrerSlug: { $exists: true, $ne: "" },
        },
      },
      {
        $group: {
          _id: "$referrerSlug",
          visitorIds: { $addToSet: VISITOR_ID_EXPR },
        },
      },
      { $project: { _id: 1, visits: { $size: "$visitorIds" } } },
      { $sort: { visits: -1 } },
    ]).exec();

    const visitsFrom = visitsFromAgg.map((r) => ({
      referrerSlug: r._id,
      visits: r.visits,
    }));

    return {
      pageType,
      slug: normalizedSlug,
      pageLabel: getPrizeLabel(normalizedSlug) ?? normalizedSlug,
      summary: { visits: totalVisits, signups: totalSignups, conversions: totalConversions, revenue: totalRevenue },
      byCampaign,
      visitsFrom,
    };
  }

  /**
   * Channel detail: which pages received traffic from a specific UTM source,
   * plus breakdown by campaign within that source.
   */
  async getChannelDetail(
    utmSource: string,
    startDate: Date,
    endDate: Date
  ): Promise<ChannelDetailResult> {
    await connectDB();

    const normalizedSource = utmSource.toLowerCase().trim();
    const isDirect = normalizedSource === "direct";

    // Helper to build $match condition for utmSource field
    const sourceMatch = (field: string) =>
      isDirect
        ? { $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: "" }] }
        : { [field]: normalizedSource };

    // ── By Page ──

    const visitByPageAgg = await PromoAnalyticsVisit.aggregate<{
      _id: { pageType: string; slug: string }; visits: number;
    }>([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
          ...(isDirect
            ? { $or: [{ utmSource: { $exists: false } }, { utmSource: null }, { utmSource: "" }] }
            : { utmSource: { $regex: new RegExp(`^${normalizedSource}$`, "i") } }),
        },
      },
      { $group: { _id: { pageType: "$pageType", slug: "$slug" }, visitorIds: { $addToSet: VISITOR_ID_EXPR } } },
      { $project: { _id: 1, visits: { $size: "$visitorIds" } } },
    ]).exec();

    const signupByPageAgg = await User.aggregate<{
      _id: { pageType: string; slug: string }; signups: number;
    }>([
      {
        $match: {
          "signupAttribution.promotionSlug": { $exists: true, $ne: "" },
          createdAt: { $gte: startDate, $lte: endDate },
          ...sourceMatch("signupAttribution.utmSource"),
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
          ...sourceMatch("data.utmSource"),
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
    let totalVisits = 0;
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

      totalVisits += visits;
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

    const visitByCampAgg = await PromoAnalyticsVisit.aggregate<{
      _id: { cmp: string; med: string }; visits: number;
    }>([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
          ...(isDirect
            ? { $or: [{ utmSource: { $exists: false } }, { utmSource: null }, { utmSource: "" }] }
            : { utmSource: { $regex: new RegExp(`^${normalizedSource}$`, "i") } }),
        },
      },
      {
        $group: {
          _id: {
            cmp: { $toLower: { $ifNull: ["$utmCampaign", ""] } },
            med: { $toLower: { $ifNull: ["$utmMedium", ""] } },
          },
          visitorIds: { $addToSet: VISITOR_ID_EXPR },
        },
      },
      { $project: { _id: 1, visits: { $size: "$visitorIds" } } },
    ]).exec();

    const signupByCampAgg = await User.aggregate<{
      _id: { cmp: string; med: string }; signups: number;
    }>([
      {
        $match: {
          "signupAttribution.promotionSlug": { $exists: true, $ne: "" },
          createdAt: { $gte: startDate, $lte: endDate },
          ...sourceMatch("signupAttribution.utmSource"),
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
          ...sourceMatch("data.utmSource"),
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

    const displaySource = isDirect ? "Direct" : normalizedSource.charAt(0).toUpperCase() + normalizedSource.slice(1);

    return {
      utmSource: displaySource,
      summary: { visits: totalVisits, signups: totalSignups, conversions: totalConversions, revenue: totalRevenue },
      byPage,
      byCampaign,
    };
  }
}

const promoAnalyticsRepository = new PromoAnalyticsRepository();
export default promoAnalyticsRepository;
