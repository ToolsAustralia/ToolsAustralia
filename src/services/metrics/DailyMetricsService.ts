/**
 * Daily Metrics Service
 * 
 * Business logic for daily metrics aggregation and retrieval.
 * 
 * ARCHITECTURE: API-First with In-Memory Caching
 * - Fetches directly from Facebook Marketing API (like Facebook Ads page)
 * - Supports all breakdown levels: account, campaign, adset, ad
 * - In-memory caching for frequently accessed date ranges (5-minute TTL)
 * 
 * DATA SOURCES:
 * ============
 * 
 * 1. AD SPEND, REVENUE, CONVERSIONS, IMPRESSIONS, CLICKS
 *    - Source: Facebook Marketing API
 *    - Storage: Stored in CENTS (e.g., 450742 = $4507.42)
 *    - Conversion: Converted to dollars when aggregating (divide by 100)
 *    - Cache: In-memory cache with 5-minute TTL
 * 
 * 2. SALES COUNT
 *    - Source: PaymentEvent model
 *    - Calculation: Count of eventType: "BenefitsGranted" events for that day
 *    - Unit: Integer (number of sales)
 * 
 * 3. REVENUE BREAKDOWN BY PACKAGE TYPE
 *    - Source: PaymentEvent model
 *    - Groups by packageType: membership, one-time, mini-draw, upsell
 *    - Shows revenue and count per package type
 * 
 * 4. PROFIT, ROAS, CTR, CPC
 *    - Calculated metrics from ad spend and revenue
 * 
 * DATE HANDLING:
 * =============
 * - All dates are normalized to UTC start/end of day for queries
 * - Dates are interpreted in AEST timezone for consistency with Facebook API
 */

import { PaymentEventRepository } from "@/repositories/PaymentEventRepository";
import { MetricsCalculationService } from "./MetricsCalculationService";
import type { IDailyMetrics, DailyMetricsQuery, DailyMetricsResult } from "@/types/metrics/DailyMetrics";
import { getDaysInRange } from "@/utils/dates/month-helpers";
import { createAESTDateAsUTC } from "@/utils/common/timezone";
import { formatInTimeZone } from "date-fns-tz";
import { fetchFacebookInsights } from "@/lib/facebook-marketing";
import connectDB from "@/lib/mongodb";
import type { InsightLevel } from "@/types/facebook-ads";

const AEST_TIMEZONE = "Australia/Sydney";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Simple in-memory cache for daily metrics
 * Key: "YYYY-MM-DD_YYYY-MM-DD_level_breakdownId" for date range
 * Value: { data: IDailyMetrics[], expiresAt: number }
 */
interface CacheEntry {
  data: IDailyMetrics[];
  expiresAt: number;
}

class DailyMetricsCache {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  get(key: string): IDailyMetrics[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  set(key: string, data: IDailyMetrics[]): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.TTL,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  // Clean up expired entries periodically
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

export class DailyMetricsService {
  private cache = new DailyMetricsCache();

  constructor(
    private paymentEventRepo = new PaymentEventRepository(),
    private calculationService = new MetricsCalculationService()
  ) {
    // Clean up cache every 10 minutes
    setInterval(() => this.cache.cleanup(), 10 * 60 * 1000);
  }

  /**
   * Get daily metrics for a date range
   * Supports all breakdown levels: account, campaign, adset, ad
   */
  async getDailyMetrics(query: DailyMetricsQuery): Promise<DailyMetricsResult> {
    await connectDB();
    
    // Generate cache key from date range and level
    const cacheKey = this.getCacheKey(query.startDate, query.endDate, query.level, query.breakdownId);
    
    // Check in-memory cache first
    const cachedData = this.cache.get(cacheKey);
    if (cachedData) {
      return { data: cachedData, cached: true };
    }

    // Aggregate on-the-fly from source data
    const aggregated = await this.aggregateMetricsForRange(
      query.startDate,
      query.endDate,
      query.level || "account",
      query.breakdownId
    );
    
    // Cache the result
    this.cache.set(cacheKey, aggregated);

    return { data: aggregated, cached: false };
  }

  /**
   * Generate cache key from date range, level, and breakdownId
   */
  private getCacheKey(
    startDate: Date,
    endDate: Date,
    level?: "account" | "campaign" | "adset" | "ad",
    breakdownId?: string
  ): string {
    const startStr = formatInTimeZone(startDate, AEST_TIMEZONE, "yyyy-MM-dd");
    const endStr = formatInTimeZone(endDate, AEST_TIMEZONE, "yyyy-MM-dd");
    const levelStr = level || "account";
    const breakdownStr = breakdownId || "";
    return `${startStr}_${endStr}_${levelStr}_${breakdownStr}`;
  }

  /**
   * Fetch Facebook insights for a date range
   * Fetches directly from Facebook Marketing API
   */
  private async fetchAndCacheFacebookInsights(
    date: Date,
    level: InsightLevel,
    breakdownId?: string
  ): Promise<{
    adSpend: number;
    revenue: number;
    impressions: number;
    clicks: number;
    conversions: number;
    breakdown?: {
      campaignId?: string;
      campaignName?: string;
      adsetId?: string;
      adsetName?: string;
      adId?: string;
      adName?: string;
    };
  } | null> {
    const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
    const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;

    if (!adAccountId || !accessToken) {
      console.warn(`[AGGREGATION] Missing Facebook API credentials`);
      return null;
    }

    // Normalize date to AEST
    const year = parseInt(formatInTimeZone(date, AEST_TIMEZONE, "yyyy"), 10);
    const month = parseInt(formatInTimeZone(date, AEST_TIMEZONE, "M"), 10);
    const day = parseInt(formatInTimeZone(date, AEST_TIMEZONE, "d"), 10);
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    // Check if future date
    const todayAEST = formatInTimeZone(new Date(), AEST_TIMEZONE, "yyyy-MM-dd");
    if (dateStr > todayAEST) {
      console.log(`[AGGREGATION] Skipping future date ${dateStr}`);
      return null;
    }

    // Fetch directly from Facebook API
    try {
      console.log(`[AGGREGATION] 📊 Fetching from Marketing API for ${dateStr} (${level})`);
      const insightsData = await fetchFacebookInsights(
        adAccountId,
        accessToken,
        { since: dateStr, until: dateStr },
        level
      );

      if (insightsData && insightsData.length > 0) {
        // Return first insight for account level, or filter by breakdownId for other levels
        if (level === "account") {
          const insight = insightsData[0];
          return {
            adSpend: insight.metrics.spend / 100,
            revenue: insight.metrics.revenue / 100,
            impressions: insight.metrics.impressions,
            clicks: insight.metrics.clicks,
            conversions: insight.metrics.conversions,
          };
        } else {
          // Find matching breakdown
          const matchingInsight = breakdownId
            ? insightsData.find(
                (insight) =>
                  (level === "campaign" && insight.breakdown?.campaignId === breakdownId) ||
                  (level === "adset" && insight.breakdown?.adsetId === breakdownId) ||
                  (level === "ad" && insight.breakdown?.adId === breakdownId)
              )
            : insightsData[0];

          if (matchingInsight) {
            return {
              adSpend: matchingInsight.metrics.spend / 100,
              revenue: matchingInsight.metrics.revenue / 100,
              impressions: matchingInsight.metrics.impressions,
              clicks: matchingInsight.metrics.clicks,
              conversions: matchingInsight.metrics.conversions,
              breakdown: matchingInsight.breakdown,
            };
          }
        }
      }
    } catch (error) {
      console.error(`[AGGREGATION] Error fetching from Marketing API:`, error);
    }

    return null;
  }

  /**
   * Get revenue breakdown by package type
   */
  private async getRevenueBreakdown(startDate: Date, endDate: Date): Promise<{
    totalRevenue: number;
    byPackageType: Record<string, { revenue: number; count: number }>;
  }> {
    const paymentEvents = await this.paymentEventRepo.findByDateRange(startDate, endDate).catch(() => []);

    const breakdown: Record<string, { revenue: number; count: number }> = {
      membership: { revenue: 0, count: 0 },
      "one-time": { revenue: 0, count: 0 },
      "mini-draw": { revenue: 0, count: 0 },
      upsell: { revenue: 0, count: 0 },
    };

    let totalRevenue = 0;

    for (const event of paymentEvents) {
      if (event.eventType === "BenefitsGranted") {
        const price = event.data?.price || 0;
        const packageType = event.packageType || "one-time";
        
        if (breakdown[packageType]) {
          breakdown[packageType].revenue += price;
          breakdown[packageType].count += 1;
        } else {
          breakdown[packageType] = { revenue: price, count: 1 };
        }
        
        totalRevenue += price;
      }
    }

    return {
      totalRevenue,
      byPackageType: breakdown,
    };
  }

  /**
   * Aggregate metrics for a single day
   */
  async aggregateDailyMetrics(
    date: Date,
    level: InsightLevel = "account",
    breakdownId?: string
  ): Promise<IDailyMetrics> {
    // Normalize date to start of day in AEST timezone
    const year = parseInt(formatInTimeZone(date, AEST_TIMEZONE, "yyyy"), 10);
    const month = parseInt(formatInTimeZone(date, AEST_TIMEZONE, "M"), 10);
    const day = parseInt(formatInTimeZone(date, AEST_TIMEZONE, "d"), 10);
    
    const startOfDay = createAESTDateAsUTC(year, month, day, 0, 0);
    const endOfDay = createAESTDateAsUTC(year, month, day, 23, 59);
    endOfDay.setUTCSeconds(59, 999);

    // Get sales count from PaymentEvents
    const paymentEvents = await this.paymentEventRepo.findByDateRange(startOfDay, endOfDay).catch(() => []);
    const salesCount = paymentEvents.length;

    // Fetch Facebook ads insights (API-first with caching)
    // Pass the date parameter which is already normalized to AEST from getDaysInRange
    // The function will extract AEST components correctly
    const adsMetrics = await this.fetchAndCacheFacebookInsights(date, level, breakdownId);

    // Get revenue breakdown
    const revenueBreakdown = await this.getRevenueBreakdown(startOfDay, endOfDay);

    // Use Facebook API data or zero values
    const adSpend = adsMetrics?.adSpend || 0;
    const revenue = adsMetrics?.revenue || 0;
    const impressions = adsMetrics?.impressions || 0;
    const clicks = adsMetrics?.clicks || 0;
    const conversions = adsMetrics?.conversions || 0;

    // Calculate all metrics
    const calculated = this.calculationService.calculateDailyMetrics({
      adSpend,
      revenue,
      salesCount,
      conversions,
      impressions,
      clicks,
    });

    return {
      date: startOfDay,
      level,
      breakdown: adsMetrics?.breakdown,
      revenueBreakdown,
      ...calculated,
    };
  }

  /**
   * Aggregate metrics for a date range
   * Processes days in parallel batches for better performance
   */
  private async aggregateMetricsForRange(
    startDate: Date,
    endDate: Date,
    level: InsightLevel = "account",
    breakdownId?: string
  ): Promise<IDailyMetrics[]> {
    const days = getDaysInRange(startDate, endDate);
    const metrics: IDailyMetrics[] = [];

    console.log(`[AGGREGATION] Processing ${days.length} days from ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]} (${level})`);

    // Process in batches of 10 days for better performance
    const BATCH_SIZE = 10;
    const batches: Date[][] = [];
    
    for (let i = 0; i < days.length; i += BATCH_SIZE) {
      batches.push(days.slice(i, i + BATCH_SIZE));
    }

    // Process batches sequentially, but days within batch in parallel
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      // Process batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(day => this.aggregateDailyMetrics(day, level, breakdownId))
      );

      // Collect successful results
      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        
        if (result.status === "fulfilled") {
          metrics.push(result.value);
        } else {
          console.error(`[AGGREGATION] Error aggregating metrics:`, result.reason);
        }
      }

      // Progress indicator
      if ((batchIndex + 1) % 5 === 0 || batchIndex === batches.length - 1) {
        const processed = Math.min((batchIndex + 1) * BATCH_SIZE, days.length);
        console.log(`[AGGREGATION] Progress: ${processed}/${days.length} days processed`);
      }
    }

    // Deduplicate by date (in case of any duplicates)
    const uniqueMetrics = new Map<string, IDailyMetrics>();
    for (const metric of metrics) {
      const dateKey = new Date(metric.date).toISOString();
      // If we already have this date, keep the first one (or merge if needed)
      if (!uniqueMetrics.has(dateKey)) {
        uniqueMetrics.set(dateKey, metric);
      }
    }
    
    const deduplicatedMetrics = Array.from(uniqueMetrics.values());
    console.log(`[AGGREGATION] Completed: ${deduplicatedMetrics.length} days aggregated (${metrics.length - deduplicatedMetrics.length} duplicates removed)`);
    return deduplicatedMetrics;
  }
}
