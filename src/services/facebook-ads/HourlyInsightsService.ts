// src/services/facebook-ads/HourlyInsightsService.ts
//
// Hourly Facebook ad insights merged with site-recorded PaymentEvent revenue.
//
// Extracted from `src/app/api/admin/facebook-ads/hourly-insights/route.ts` so
// the admin route and Norm projection call the same orchestration and report
// identical numbers by construction.
//
// - Spend / impressions / clicks come from Meta's Marketing API at hourly
//   granularity (advertiser timezone).
// - Revenue / conversions come from the local `PaymentEvent` collection
//   (BenefitsGranted, excludes membership renewals via Mongo aggregation),
//   bucketed by hour-of-day in AEST.
// - Landing page views (LPV) are NOT available from Meta at hourly granularity
//   — `landingPageView` is `null` for every hour by design.
//
// Framework-agnostic — no Request / NextResponse types.

import {
  fetchFacebookInsightsHourly,
  fetchFacebookInsightsHourlyFiltered,
} from "@/lib/facebook-marketing";
import { PaymentEventRepository } from "@/repositories/PaymentEventRepository";
import { createAESTDateAsUTC } from "@/utils/common/timezone";
import type { HourlyInsightItem } from "@/types/facebook-ads";

export interface HourlyInsightsServiceInput {
  /** AEST calendar date, YYYY-MM-DD. */
  startDate: string;
  /** AEST calendar date, YYYY-MM-DD. */
  endDate: string;
  filterLevel?: "campaign" | "adset" | "ad";
  /** When set, restrict the Facebook query to these IDs at `filterLevel`. */
  filterIds?: string[];
  /** Optional UTM-source filter for the local PaymentEvent half (e.g. `facebook`). */
  utmSource?: string;
}

export interface HourlyInsightsServiceResult {
  hourly: HourlyInsightItem[];
  totalConversions: number;
  totalRevenue: number;
  dateRange: { start: string; end: string };
}

export class HourlyInsightsService {
  constructor(
    private deps: {
      accessToken?: string;
      adAccountId?: string;
    } = {},
  ) {}

  async getHourly(input: HourlyInsightsServiceInput): Promise<HourlyInsightsServiceResult> {
    const accessToken = this.deps.accessToken ?? process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
    const adAccountId = this.deps.adAccountId ?? process.env.FACEBOOK_AD_ACCOUNT_ID;

    if (!accessToken) {
      throw new Error("FACEBOOK_MARKETING_ACCESS_TOKEN not configured");
    }
    if (!adAccountId) {
      throw new Error("FACEBOOK_AD_ACCOUNT_ID not configured");
    }

    // Build AEST bounds for PaymentEvent query (same calendar days as range).
    const startYear = parseInt(input.startDate.slice(0, 4), 10);
    const startMonth = parseInt(input.startDate.slice(5, 7), 10);
    const startDay = parseInt(input.startDate.slice(8, 10), 10);
    const startOfRangeAEST = createAESTDateAsUTC(startYear, startMonth, startDay, 0, 0);

    const endYear = parseInt(input.endDate.slice(0, 4), 10);
    const endMonth = parseInt(input.endDate.slice(5, 7), 10);
    const endDay = parseInt(input.endDate.slice(8, 10), 10);
    const endOfRangeAEST = createAESTDateAsUTC(endYear, endMonth, endDay, 23, 59);
    endOfRangeAEST.setUTCSeconds(59, 999);

    const filterLevel = input.filterLevel;
    const filterIds = (input.filterIds ?? []).map((s) => s.trim()).filter(Boolean);

    // Facebook half — spend/impressions/clicks per hour.
    const fbHourlyData =
      filterLevel && filterIds.length > 0
        ? await fetchFacebookInsightsHourlyFiltered(
            adAccountId,
            accessToken,
            { since: input.startDate, until: input.endDate },
            { level: filterLevel, filterIds },
          )
        : await fetchFacebookInsightsHourly(adAccountId, accessToken, {
            since: input.startDate,
            until: input.endDate,
          });

    // PaymentEvent half — revenue/conversions per hour-of-day in AEST.
    const paymentEventRepo = new PaymentEventRepository();
    const dbHourlyData = await paymentEventRepo.aggregateRevenueAndCountByHourOfDay(
      startOfRangeAEST,
      endOfRangeAEST,
      {
        ...(input.utmSource && { utmSource: input.utmSource }),
      },
    );

    const hourly: HourlyInsightItem[] = fbHourlyData.map((fbItem, hour) => {
      const spend = fbItem.spend / 100; // cents → dollars
      const impressions = fbItem.impressions;
      const clicks = fbItem.clicks;
      const dbItem = dbHourlyData[hour];
      const revenue = dbItem.revenue; // dollars from PaymentEvent.data.price
      const conversions = dbItem.conversions;
      const profit = revenue - spend;
      const roas = spend > 0 ? revenue / spend : 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;
      const label = formatHourLabel(hour);

      return {
        hour,
        label,
        spend,
        impressions,
        clicks,
        landingPageView: null, // Meta API does not provide LPV with hourly breakdown
        revenue,
        conversions,
        profit,
        roas,
        ctr,
        cpc,
      };
    });

    const totalConversions = hourly.reduce((s, h) => s + h.conversions, 0);
    const totalRevenue = hourly.reduce((s, h) => s + h.revenue, 0);

    return {
      hourly,
      totalConversions,
      totalRevenue,
      dateRange: { start: input.startDate, end: input.endDate },
    };
  }
}

/**
 * Format hour (0-23) as human-readable label.
 */
function formatHourLabel(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:00 ${period}`;
}
