import connectDB from "@/lib/mongodb";
import PromoAnalyticsVisit from "@/models/PromoAnalyticsVisit";
import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import { listPrizes } from "@/config/prizes";
import { TOOLSET_LANDING_SLUGS } from "@/config/promo-landing-slugs";
import { getPageTypeFromSlug } from "@/utils/promo-analytics/validate-promo-slug";
import mongoose from "mongoose";
import type { PromoPageType } from "@/models/PromoAnalyticsVisit";

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
}

const promoAnalyticsRepository = new PromoAnalyticsRepository();
export default promoAnalyticsRepository;
