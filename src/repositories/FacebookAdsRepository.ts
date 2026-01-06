/**
 * Facebook Ads Repository
 * 
 * Data access layer for FacebookAdsInsight model.
 * Provides methods for querying Facebook ads data for metrics aggregation.
 */

import FacebookAdsInsight from "@/models/FacebookAdsInsight";
import type { IFacebookAdsInsight } from "@/models/FacebookAdsInsight";
import { formatInTimeZone } from "date-fns-tz";

export class FacebookAdsRepository {
  /**
   * Find Facebook ads insights by date range
   * @param startDate - Start date (inclusive)
   * @param endDate - End date (inclusive)
   * @param level - Insight level (account, campaign, or adset)
   * @returns Array of Facebook ads insights
   */
  async findByDateRange(
    startDate: Date,
    endDate: Date,
    level: "account" | "campaign" | "adset" = "account"
  ): Promise<IFacebookAdsInsight[]> {
    return FacebookAdsInsight.find({
      date: {
        $gte: startDate,
        $lte: endDate,
      },
      level,
    })
      .lean()
      .exec();
  }

  /**
   * Get aggregated ad spend for a date range
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Total ad spend (in dollars, not cents)
   */
  async getAdSpendSum(startDate: Date, endDate: Date): Promise<number> {
    const result = await FacebookAdsInsight.aggregate([
      {
        $match: {
          date: {
            $gte: startDate,
            $lte: endDate,
          },
          level: "account", // Aggregate at account level
        },
      },
      {
        $group: {
          _id: null,
          totalSpend: {
            $sum: "$metrics.spend",
          },
        },
      },
    ]).exec();

    // Convert from cents to dollars
    return (result[0]?.totalSpend || 0) / 100;
  }

  /**
   * Get aggregated metrics for a date range
   * 
   * OPTIMIZED VERSION:
   * - For single-day queries: Only use exact date matches or single-day dateRange matches
   * - For range queries: Use exact date matches per day, avoid double-counting from overlapping ranges
   * - Prefer exact date matches over dateRange matches to ensure accuracy
   * 
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Aggregated metrics
   */
  async getAggregatedMetrics(startDate: Date, endDate: Date): Promise<{
    adSpend: number;
    revenue: number;
    impressions: number;
    clicks: number;
    conversions: number;
  }> {
    const queryAESTDay = formatInTimeZone(startDate, "Australia/Sydney", "yyyy-MM-dd");
    const isSingleDay = (endDate.getTime() - startDate.getTime()) < 24 * 60 * 60 * 1000;

    if (isSingleDay) {
      // SINGLE DAY QUERY - Use strict matching to prevent double-counting
      return this.getSingleDayMetrics(startDate, endDate, queryAESTDay);
    } else {
      // RANGE QUERY - Aggregate per day to avoid double-counting
      return this.getRangeMetrics(startDate, endDate);
    }
  }

  /**
   * Get metrics for a single day
   * Strategy: Prefer exact date matches, only use dateRange if it's a single-day range
   */
  private async getSingleDayMetrics(
    startDate: Date,
    endDate: Date,
    queryAESTDay: string
  ): Promise<{
    adSpend: number;
    revenue: number;
    impressions: number;
    clicks: number;
    conversions: number;
  }> {
    // Step 1: Try exact date match first (most accurate)
    const exactDateInsights = await FacebookAdsInsight.find({
      date: {
        $gte: startDate,
        $lte: endDate,
      },
      level: "account",
    })
      .sort({ syncedAt: -1 })
      .lean()
      .exec();

    if (exactDateInsights.length > 0) {
      // Use the most recent exact date match
      const insight = exactDateInsights[0];
      return {
        adSpend: (insight.metrics?.spend || 0) / 100,
        revenue: (insight.metrics?.revenue || 0) / 100,
        impressions: insight.metrics?.impressions || 0,
        clicks: insight.metrics?.clicks || 0,
        conversions: insight.metrics?.conversions || 0,
      };
    }

    // Step 2: Fallback to single-day dateRange matches only
    // Only accept dateRanges that are approximately one day (≤ 1.5 days for timezone edge cases)
    const allRangeInsights = await FacebookAdsInsight.find({
      "dateRange.start": { $lte: endDate },
      "dateRange.end": { $gte: startDate },
      level: "account",
    })
      .sort({ syncedAt: -1 })
      .lean()
      .exec();

    // Filter to only single-day dateRanges that match the query day
    const validInsights = allRangeInsights.filter((insight) => {
      if (!insight.dateRange) return false;

      const rangeStart = new Date(insight.dateRange.start);
      const rangeEnd = new Date(insight.dateRange.end);
      const durationMs = rangeEnd.getTime() - rangeStart.getTime();
      const maxDurationMs = 1.5 * 24 * 60 * 60 * 1000; // 1.5 days

      // Must be approximately one day
      if (durationMs > maxDurationMs) return false;

      // Query date must fall within range
      const queryMidpoint = new Date((startDate.getTime() + endDate.getTime()) / 2);
      if (queryMidpoint < rangeStart || queryMidpoint > rangeEnd) return false;

      // Must match same AEST day
      const rangeStartAEST = formatInTimeZone(rangeStart, "Australia/Sydney", "yyyy-MM-dd");
      return rangeStartAEST === queryAESTDay;
    });

    if (validInsights.length === 0) {
      return {
        adSpend: 0,
        revenue: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
      };
    }

    // Use most recent valid insight
    const insight = validInsights[0];
    return {
      adSpend: (insight.metrics?.spend || 0) / 100,
      revenue: (insight.metrics?.revenue || 0) / 100,
      impressions: insight.metrics?.impressions || 0,
      clicks: insight.metrics?.clicks || 0,
      conversions: insight.metrics?.conversions || 0,
    };
  }

  /**
   * Get metrics for a date range
   * Strategy: Aggregate per day using exact date matches to avoid double-counting
   */
  private async getRangeMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    adSpend: number;
    revenue: number;
    impressions: number;
    clicks: number;
    conversions: number;
  }> {
    // For range queries, we need to aggregate per day to avoid double-counting
    // from overlapping dateRanges. We'll use exact date matches per day.
    
    // Get all insights with exact date matches in the range
    const exactDateInsights = await FacebookAdsInsight.find({
      date: {
        $gte: startDate,
        $lte: endDate,
      },
      level: "account",
    })
      .lean()
      .exec();

    // Group by AEST day to handle timezone edge cases
    const dailyMetrics = new Map<string, {
      adSpend: number;
      revenue: number;
      impressions: number;
      clicks: number;
      conversions: number;
    }>();

    for (const insight of exactDateInsights) {
      const insightAESTDay = formatInTimeZone(insight.date, "Australia/Sydney", "yyyy-MM-dd");
      
      const existing = dailyMetrics.get(insightAESTDay) || {
        adSpend: 0,
        revenue: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
      };

      // For same-day duplicates, use the most recent one (already sorted by syncedAt)
      // But if we already have data for this day, prefer the one with more recent syncedAt
      const currentInsightDate = new Date(insight.syncedAt || 0);
      const existingDate = dailyMetrics.has(insightAESTDay) ? currentInsightDate : new Date(0);
      
      // Only update if this insight is more recent or we don't have data for this day
      if (currentInsightDate >= existingDate || !dailyMetrics.has(insightAESTDay)) {
        dailyMetrics.set(insightAESTDay, {
          adSpend: (insight.metrics?.spend || 0) / 100,
          revenue: (insight.metrics?.revenue || 0) / 100,
          impressions: insight.metrics?.impressions || 0,
          clicks: insight.metrics?.clicks || 0,
          conversions: insight.metrics?.conversions || 0,
        });
      }
    }

    // Sum all daily metrics
    const aggregated = Array.from(dailyMetrics.values()).reduce(
      (acc, day) => ({
        adSpend: acc.adSpend + day.adSpend,
        revenue: acc.revenue + day.revenue,
        impressions: acc.impressions + day.impressions,
        clicks: acc.clicks + day.clicks,
        conversions: acc.conversions + day.conversions,
      }),
      {
        adSpend: 0,
        revenue: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
      }
    );

    return aggregated;
  }
}

