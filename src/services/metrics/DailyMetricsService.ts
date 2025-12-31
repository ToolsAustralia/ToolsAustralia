/**
 * Daily Metrics Service
 * 
 * Business logic for daily metrics aggregation and retrieval.
 * 
 * DATA SOURCES:
 * ============
 * 
 * 1. AD SPEND
 *    - Source: Facebook Marketing API → FacebookAdsInsight model
 *    - Storage: Stored in CENTS (e.g., 450742 = $4507.42)
 *    - Conversion: Converted to dollars when aggregating (divide by 100)
 *    - Query: Finds insights where dateRange overlaps with query date
 * 
 * 2. REVENUE
 *    - Primary Source: PaymentEvent model (data.price field)
 *      * Unit: DOLLARS (e.g., 500 = $500.00)
 *      * When: Actual sales that occurred on that specific day
 *      * Query: eventType: "BenefitsGranted" with timestamp in date range
 *      * Note: Price is converted from Stripe cents to dollars when PaymentEvent is created
 * 
 *    - Fallback Source: FacebookAdsInsight (metrics.revenue field)
 *      * Unit: Stored in CENTS, converted to dollars (divide by 100)
 *      * When: Revenue attributed to ads via 28-day click attribution window
 *      * Note: May include sales from previous days due to attribution window
 *      * Used only when PaymentEvent revenue is 0
 * 
 *    - Strategy: Use PaymentEvent revenue as primary (actual daily sales).
 *                Use Facebook ads revenue only as fallback to avoid double-counting.
 * 
 * 3. SALES COUNT
 *    - Source: PaymentEvent model
 *    - Calculation: Count of eventType: "BenefitsGranted" events for that day
 *    - Unit: Integer (number of sales)
 * 
 * 4. PROFIT
 *    - Calculation: Revenue - Ad Spend
 *    - Unit: Dollars
 * 
 * 5. CONVERSIONS
 *    - Source: Facebook Marketing API → FacebookAdsInsight model
 *    - Storage: Purchase count from Facebook's actions array
 *    - Unit: Integer (number of conversions)
 *    - Note: Uses 28-day click attribution window
 * 
 * 6. IMPRESSIONS & CLICKS
 *    - Source: Facebook Marketing API → FacebookAdsInsight model
 *    - Unit: Integer
 * 
 * DATE HANDLING:
 * =============
 * - All dates are normalized to UTC start/end of day for queries
 * - FacebookAdsInsight dateRanges are stored in UTC but represent AEST dates
 * - Date matching checks both exact date match and dateRange overlap
 */

import { DailyMetricsRepository } from "@/repositories/DailyMetricsRepository";
import { PaymentEventRepository } from "@/repositories/PaymentEventRepository";
import { FacebookAdsRepository } from "@/repositories/FacebookAdsRepository";
import { MetricsCalculationService } from "./MetricsCalculationService";
import type { IDailyMetrics, DailyMetricsQuery, DailyMetricsResult } from "@/types/metrics/DailyMetrics";
import { getDaysInRange } from "@/utils/dates/month-helpers";
import { createAESTDateAsUTC } from "@/utils/common/timezone";
import { formatInTimeZone } from "date-fns-tz";
import { fetchFacebookInsights } from "@/lib/facebook-marketing";
import FacebookAdsInsight from "@/models/FacebookAdsInsight";

const AEST_TIMEZONE = "Australia/Sydney";

export class DailyMetricsService {
  constructor(
    private dailyMetricsRepo = new DailyMetricsRepository(),
    private paymentEventRepo = new PaymentEventRepository(),
    private facebookAdsRepo = new FacebookAdsRepository(),
    private calculationService = new MetricsCalculationService()
  ) {}

  /**
   * Get daily metrics for a date range
   * Checks cache first, aggregates if missing
   */
  async getDailyMetrics(query: DailyMetricsQuery): Promise<DailyMetricsResult> {
    // Check if we have cached data
    const cached = await this.dailyMetricsRepo.findByDateRange(query.startDate, query.endDate);
    
    // Check if cache is complete
    const isComplete = await this.dailyMetricsRepo.isRangeComplete(query.startDate, query.endDate);
    
    if (cached.length > 0 && isComplete) {
      return { data: cached, cached: true };
    }

    // Aggregate missing dates
    const aggregated = await this.aggregateMetricsForRange(query.startDate, query.endDate);
    
    // Store aggregated data
    if (aggregated.length > 0) {
      await this.dailyMetricsRepo.bulkUpsert(aggregated);
    }

    // Fetch again to get complete data
    const finalData = await this.dailyMetricsRepo.findByDateRange(query.startDate, query.endDate);

    return { data: finalData, cached: false };
  }

  /**
   * Aggregate metrics for a single day
   * 
   * IMPORTANT: Dates are normalized to AEST timezone for consistency with Facebook Ads data.
   * FacebookAdsInsight dateRanges are stored in UTC but represent AEST dates.
   * This ensures we match the same dates that the Facebook Ads page uses.
   */
  async aggregateDailyMetrics(date: Date): Promise<IDailyMetrics> {
    // Normalize date to start of day in AEST timezone, then convert to UTC for database queries
    // This matches how the Facebook Ads page calculates dates (using AEST)
    const year = parseInt(formatInTimeZone(date, AEST_TIMEZONE, "yyyy"), 10);
    const month = parseInt(formatInTimeZone(date, AEST_TIMEZONE, "M"), 10);
    const day = parseInt(formatInTimeZone(date, AEST_TIMEZONE, "d"), 10);
    
    // Create start and end of day in AEST, converted to UTC for database storage
    // This matches how the Facebook Ads page calculates dates (using AEST)
    const startOfDay = createAESTDateAsUTC(year, month, day, 0, 0);
    // End of day: 23:59:59.999 in AEST, converted to UTC
    const endOfDay = createAESTDateAsUTC(year, month, day, 23, 59);
    // Add 59 seconds and 999ms to get end of day
    endOfDay.setUTCSeconds(59, 999);
    
    console.log(`[AGGREGATION] Aggregating for ${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} (AEST)`);
    console.log(`[AGGREGATION] Query range (UTC): ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);

    // Get payment events for the day
    const paymentEvents = await this.paymentEventRepo.findByDateRange(startOfDay, endOfDay).catch((error) => {
      console.error(`[AGGREGATION] Error fetching payment events for ${startOfDay.toISOString()}:`, error);
      return [];
    });
    
    // Calculate revenue from PaymentEvents
    // NOTE: PaymentEvent.data.price is in DOLLARS (converted from Stripe cents when created)
    const revenue = paymentEvents.reduce((sum, event) => {
      const price = event.data?.price || 0;
      // Validate: price should be in dollars (reasonable range: $0.01 to $100,000)
      if (price < 0 || price > 100000) {
        console.warn(`[AGGREGATION] Suspicious price value: $${price} for event ${event._id}`);
      }
      return sum + price;
    }, 0);
    const salesCount = paymentEvents.length;

    // Debug logging
    if (paymentEvents.length > 0) {
      console.log(`[AGGREGATION] Found ${paymentEvents.length} payment events for ${startOfDay.toISOString().split("T")[0]}, revenue: $${revenue}`);
    }

    // Get Facebook ads insights for the day
    let adsMetrics = await this.facebookAdsRepo.getAggregatedMetrics(startOfDay, endOfDay).catch((error) => {
      console.error(`[AGGREGATION] Error fetching Facebook ads for ${startOfDay.toISOString()}:`, error);
      return {
        adSpend: 0,
        revenue: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
      };
    });

    // CRITICAL: If no data found in cache, fetch from Marketing API
    // This ensures analytics always show accurate data, matching the Facebook Ads page behavior
    if (adsMetrics.adSpend === 0 && adsMetrics.conversions === 0 && adsMetrics.revenue === 0) {
      console.log(`[AGGREGATION] No cached data found, fetching from Marketing API for ${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} (AEST)`);
      
      const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
      const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
      
      if (adAccountId && accessToken) {
        // Format date in AEST for Facebook API (same format as Facebook Ads page)
        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        
        try {
          // Fetch from Marketing API
          const insightsData = await fetchFacebookInsights(
            adAccountId,
            accessToken,
            { since: dateStr, until: dateStr },
            "account"
          );
          
          if (insightsData && insightsData.length > 0 && insightsData[0]) {
            const insight = insightsData[0];
            
            // Save to cache for future use (same structure as Facebook Ads page)
            const insightDoc = new FacebookAdsInsight({
              adAccountId,
              date: startOfDay,
              dateRange: {
                start: startOfDay,
                end: endOfDay,
              },
              level: "account",
              metrics: insight.metrics, // Already in cents from processInsightData
              calculated: {
                profit: insight.metrics.profit,
                roas: insight.metrics.roas,
                ctr: insight.metrics.ctr,
                cpc: insight.metrics.cpc,
              },
              syncedAt: new Date(),
            });
            
            await insightDoc.save();
            console.log(`[AGGREGATION] ✅ Fetched and cached data from Marketing API for ${dateStr}`);
            
            // Use the fresh data (convert from cents to dollars)
            adsMetrics = {
              adSpend: insight.metrics.spend / 100,  // Convert cents to dollars
              revenue: insight.metrics.revenue / 100, // Convert cents to dollars
              impressions: insight.metrics.impressions,
              clicks: insight.metrics.clicks,
              conversions: insight.metrics.conversions,
            };
          } else {
            console.log(`[AGGREGATION] No data returned from Marketing API for ${dateStr}`);
          }
        } catch (error) {
          console.error(`[AGGREGATION] Error fetching from Marketing API for ${dateStr}:`, error);
          // Continue with zero values if API fails (better than crashing)
        }
      } else {
        console.warn(`[AGGREGATION] Missing Facebook API credentials (FACEBOOK_AD_ACCOUNT_ID or FACEBOOK_MARKETING_ACCESS_TOKEN)`);
      }
    }

    // Debug logging
    if (adsMetrics.adSpend > 0 || adsMetrics.conversions > 0 || adsMetrics.revenue > 0) {
      console.log(`[AGGREGATION] Facebook ads for ${startOfDay.toISOString().split("T")[0]}, spend: $${adsMetrics.adSpend}, revenue: $${adsMetrics.revenue}, conversions: ${adsMetrics.conversions}`);
    }
    
    // Combine revenue from both sources with clear strategy:
    // 
    // PRIMARY: PaymentEvent revenue (actual sales on that day in DOLLARS)
    //   - Most accurate for daily metrics
    //   - Represents real transactions that occurred on that specific day
    // 
    // FALLBACK: FacebookAdsInsight revenue (attributed revenue in DOLLARS after conversion)
    //   - Used only when PaymentEvent revenue is 0
    //   - Represents revenue attributed to ads via 28-day click attribution window
    //   - May include sales from previous days, so we prefer PaymentEvent when available
    //   - NOTE: Already converted from cents to dollars in FacebookAdsRepository
    // 
    // This prevents double-counting while ensuring we capture revenue even if PaymentEvents
    // are missing for some reason.
    const totalRevenue = revenue > 0 ? revenue : adsMetrics.revenue;
    
    // Log if we're using fallback revenue
    if (revenue === 0 && adsMetrics.revenue > 0) {
      console.log(`[AGGREGATION] Using Facebook ads attributed revenue ($${adsMetrics.revenue}) as fallback for ${startOfDay.toISOString().split("T")[0]}`);
    }

    // Calculate all metrics
    const calculated = this.calculationService.calculateDailyMetrics({
      adSpend: adsMetrics.adSpend,
      revenue: totalRevenue,
      salesCount,
      conversions: adsMetrics.conversions,
      impressions: adsMetrics.impressions,
      clicks: adsMetrics.clicks,
    });

    // Store the date as the AEST day normalized to UTC
    // This ensures the date represents the AEST business day, not UTC day
    // Example: Dec 30 AEST is stored as UTC representation of Dec 30 00:00:00 AEST
    return {
      date: startOfDay, // Already normalized to AEST day in UTC
      ...calculated,
    };
  }

  /**
   * Aggregate metrics for a date range
   * 
   * IMPORTANT: Only stores metrics for days with actual data (adSpend > 0 OR revenue > 0 OR salesCount > 0)
   * This ensures we don't create misleading zero-value entries for days before ads started.
   */
  private async aggregateMetricsForRange(startDate: Date, endDate: Date): Promise<IDailyMetrics[]> {
    const days = getDaysInRange(startDate, endDate);
    const metrics: IDailyMetrics[] = [];
    let daysWithData = 0;
    let daysSkipped = 0;

    console.log(`[AGGREGATION] Processing ${days.length} days from ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}`);

    // Aggregate each day
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      try {
        const dailyMetric = await this.aggregateDailyMetrics(day);
        
        // CRITICAL: Only store metrics for days with actual data
        // This prevents storing zero-value entries for days before ads started
        const hasData = dailyMetric.adSpend > 0 || dailyMetric.revenue > 0 || dailyMetric.salesCount > 0;
        
        if (hasData) {
          metrics.push(dailyMetric);
          daysWithData++;
          if (daysWithData <= 5) {
            // Log first 5 days with data
            console.log(`[AGGREGATION] Day ${i + 1}/${days.length} (${day.toISOString().split("T")[0]}): revenue=$${dailyMetric.revenue}, adSpend=$${dailyMetric.adSpend}, sales=${dailyMetric.salesCount}`);
          }
        } else {
          daysSkipped++;
          // Log skipped days only for first few to avoid spam
          if (daysSkipped <= 3) {
            console.log(`[AGGREGATION] Skipping ${day.toISOString().split("T")[0]} - no data (adSpend=$${dailyMetric.adSpend}, revenue=$${dailyMetric.revenue}, sales=${dailyMetric.salesCount})`);
          }
        }
        
        // Progress indicator every 10 days
        if ((i + 1) % 10 === 0) {
          console.log(`[AGGREGATION] Progress: ${i + 1}/${days.length} days processed (${daysWithData} with data, ${daysSkipped} skipped)`);
        }
      } catch (error) {
        console.error(`[AGGREGATION] Error aggregating metrics for ${day.toISOString()}:`, error);
        // Continue with other days even if one fails
      }
    }

    console.log(`[AGGREGATION] Completed: ${daysWithData} days with data stored, ${daysSkipped} days skipped (no data)`);
    return metrics;
  }

  /**
   * Ensure metrics are aggregated for a date range
   * Useful for background jobs
   * 
   * NOTE: Dates should represent AEST days. The function will normalize them.
   * IMPORTANT: Only stores metrics for days with actual data (adSpend > 0 OR revenue > 0 OR salesCount > 0)
   */
  async ensureDailyMetricsAggregated(startDate: Date, endDate: Date): Promise<void> {
    const days = getDaysInRange(startDate, endDate);
    
    for (const day of days) {
      // Check if metric already exists
      // findByDate now expects AEST day normalized to UTC
      const existing = await this.dailyMetricsRepo.findByDate(day);
      
      if (!existing) {
        // Aggregate metrics for this day
        // aggregateDailyMetrics will normalize the date to AEST day in UTC
        const metric = await this.aggregateDailyMetrics(day);
        
        // CRITICAL: Only store if there's actual data
        // This prevents storing zero-value entries for days before ads started
        const hasData = metric.adSpend > 0 || metric.revenue > 0 || metric.salesCount > 0;
        
        if (hasData) {
          await this.dailyMetricsRepo.createOrUpdate(metric);
        }
        // If no data, skip storing (don't create zero-value entries)
      }
    }
  }
}

