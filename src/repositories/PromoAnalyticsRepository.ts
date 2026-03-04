import connectDB from "@/lib/mongodb";
import PromoAnalyticsVisit from "@/models/PromoAnalyticsVisit";
import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
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

    // 1. Aggregate visits from PromoAnalyticsVisit
    const visitAgg = await PromoAnalyticsVisit.aggregate<{ _id: { pageType: string; slug: string }; visits: number }>([
      { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { pageType: "$pageType", slug: "$slug" },
          visits: { $sum: 1 },
        },
      },
    ]).exec();

    const visitMap = new Map<string, number>();
    for (const r of visitAgg) {
      visitMap.set(`${r._id.pageType}:${r._id.slug}`, r.visits);
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
      signupMap.set(`${pageType}:${r._id.promotionSlug}`, r.signups);
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
      conversionMap.set(`${pageType}:${r._id.slug}`, {
        conversions: r.conversions,
        revenue: r.revenue ?? 0,
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
      { $group: { _id: "$_utmKey", visits: { $sum: 1 } } },
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

    // 1. Visits by (utmSource, utmMedium, utmCampaign)
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
          visits: { $sum: 1 },
        },
      },
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

    return {
      pageType,
      slug: normalizedSlug,
      pageLabel: getPrizeLabel(normalizedSlug) ?? normalizedSlug,
      summary: { visits: totalVisits, signups: totalSignups, conversions: totalConversions, revenue: totalRevenue },
      byCampaign,
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
      { $group: { _id: { pageType: "$pageType", slug: "$slug" }, visits: { $sum: 1 } } },
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
          visits: { $sum: 1 },
        },
      },
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
