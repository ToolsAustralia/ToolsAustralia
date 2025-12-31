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
    console.log(`[FacebookAdsRepo] Querying aggregated metrics:`, {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
    
    // Facebook ads insights can be stored with:
    // 1. date field matching the query date (daily insights)
    // 2. dateRange that overlaps with the query range (range-based insights)
    // We need to check both
    
    // First check exact date match
    const exactDateCount = await FacebookAdsInsight.countDocuments({
      date: {
        $gte: startDate,
        $lte: endDate,
      },
      level: "account",
    });
    console.log(`[FacebookAdsRepo] Found ${exactDateCount} insights with exact date match`);
    
    // Check dateRange overlap (insight's dateRange overlaps with our query range)
    const rangeOverlapCount = await FacebookAdsInsight.countDocuments({
      "dateRange.start": { $lte: endDate },
      "dateRange.end": { $gte: startDate },
      level: "account",
    });
    console.log(`[FacebookAdsRepo] Found ${rangeOverlapCount} insights with dateRange overlap`);
    
    // Debug: Show sample dateRanges in database to understand the data structure
    if (rangeOverlapCount === 0 && exactDateCount === 0) {
      const sampleInsights = await FacebookAdsInsight.find({ level: "account" })
        .select("date dateRange")
        .sort({ date: -1 })
        .limit(5)
        .lean();
      console.log(`[FacebookAdsRepo] Sample insights in database (for debugging):`, 
        sampleInsights.map(insight => ({
          date: insight.date,
          dateRangeStart: insight.dateRange?.start,
          dateRangeEnd: insight.dateRange?.end,
        }))
      );
      console.log(`[FacebookAdsRepo] Query range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    }
    
    // For daily aggregation, we want insights where the date falls within our range
    // OR where the dateRange overlaps with our single day
    // Since we're aggregating per day, we'll use the date field for exact matches
    // and for range-based insights, we'll need to proportionally allocate them
    
    // Check what dates actually exist
    if (exactDateCount > 0 || rangeOverlapCount > 0) {
      const dateSamples = await FacebookAdsInsight.find({
        $or: [
          {
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          },
          {
            "dateRange.start": { $lte: endDate },
            "dateRange.end": { $gte: startDate },
          },
        ],
        level: "account",
      })
        .select("date dateRange level metrics")
        .lean()
        .limit(5);
      console.log(`[FacebookAdsRepo] Sample insights:`, dateSamples.map((d) => ({
        date: d.date,
        dateRange: d.dateRange,
        spend: d.metrics?.spend,
        revenue: d.metrics?.revenue,
      })));
    }
    
    // For daily aggregation, we need to handle overlapping insights properly
    // The issue: Multiple insights can cover the same day (e.g., one for Dec 2-10, another for Dec 8-9)
    // Solution: For single-day queries, prefer the most specific (shortest dateRange) or most recent insight
    
    // Calculate if this is a single day query
    const isSingleDay = startDate.getTime() === endDate.getTime() || 
      (endDate.getTime() - startDate.getTime()) < 24 * 60 * 60 * 1000;
    
    let result: Array<{
      adSpend: number;
      revenue: number;
      impressions: number;
      clicks: number;
      conversions: number;
    }>;
    
    if (isSingleDay) {
      // Single day query - find insights that match THIS SPECIFIC DAY
      // 
      // CRITICAL: For single-day queries, we must be strict to avoid matching
      // wide dateRanges (e.g., Nov 1 - Dec 9) which would incorrectly attribute
      // cumulative metrics to a single day.
      // 
      // Date matching strategy:
      // 1. Exact date match: insight.date falls within query range (preferred)
      // 2. Single-day dateRange: insight's dateRange is approximately one day
      //    - Only use if dateRange duration is <= 2 days (to handle timezone edge cases)
      //    - AND the query date falls within the dateRange
      // 
      // Note: We explicitly exclude wide dateRanges to prevent incorrect attribution
      const allMatchingInsights = await FacebookAdsInsight.find({
        $or: [
          {
            // Exact date match: insight.date is within the query day
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          },
          {
            // DateRange overlap: insight's dateRange includes the query day
            // We'll filter by duration in application code below
            "dateRange.start": { $lte: endDate },
            "dateRange.end": { $gte: startDate },
          },
        ],
        level: "account",
      })
        .sort({ syncedAt: -1 }) // Most recent first
        .lean()
        .exec();
      
      // CRITICAL: Filter to only include insights that match THIS SPECIFIC DAY
      // We must be extremely strict to prevent:
      // 1. Matching wide dateRanges (e.g., Dec 2-10) for a single day query
      // 2. Date mismatches (Dec 27 data showing on Dec 26)
      // 3. Duplicate entries from multiple matching insights
      const matchingInsights = allMatchingInsights.filter((insight) => {
        // Strategy 1: Exact date match (preferred - most accurate)
        // Check if insight.date falls within the query day
        if (insight.date) {
          const insightDate = new Date(insight.date);
          // Check if insight date is within query range (same day)
          if (insightDate >= startDate && insightDate <= endDate) {
            return true;
          }
        }
        
        // Strategy 2: Single-day dateRange match (only if no exact date match)
        // Only use dateRange insights if:
        // - The dateRange is approximately one day (≤ 1.5 days to handle timezone edge cases)
        // - The query date (startDate) falls within the dateRange
        // - We verify the dateRange actually represents the query day
        if (insight.dateRange) {
          const rangeStart = new Date(insight.dateRange.start);
          const rangeEnd = new Date(insight.dateRange.end);
          const durationMs = rangeEnd.getTime() - rangeStart.getTime();
          const maxDurationMs = 1.5 * 24 * 60 * 60 * 1000; // 1.5 days (stricter than before)
          
          // Check if dateRange is approximately one day
          if (durationMs > maxDurationMs) {
            return false; // Reject wide dateRanges
          }
          
          // CRITICAL: Verify the query date actually falls within the dateRange
          // This prevents Dec 27 data from matching Dec 26 queries
          const queryDateMidpoint = new Date((startDate.getTime() + endDate.getTime()) / 2);
          if (queryDateMidpoint >= rangeStart && queryDateMidpoint <= rangeEnd) {
            // Additional check: ensure the dateRange represents the same AEST day as query
            // Extract AEST day from both query date and dateRange start
            const queryAESTDay = formatInTimeZone(startDate, "Australia/Sydney", "yyyy-MM-dd");
            const rangeStartAESTDay = formatInTimeZone(rangeStart, "Australia/Sydney", "yyyy-MM-dd");
            
            // Only match if they're the same AEST day
            return queryAESTDay === rangeStartAESTDay;
          }
        }
        
        return false;
      });
      
      console.log(`[FacebookAdsRepo] Found ${matchingInsights.length} insights covering this day`);
      
      // Log query details for debugging
      const queryAESTDay = formatInTimeZone(startDate, "Australia/Sydney", "yyyy-MM-dd");
      console.log(`[FacebookAdsRepo] Query date (AEST): ${queryAESTDay}, UTC range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      if (matchingInsights.length === 0) {
        console.log(`[FacebookAdsRepo] No matching insights found for ${queryAESTDay}`);
        result = [];
      } else if (matchingInsights.length === 1) {
        // Single insight - use it directly
        // NOTE: All metrics are stored in CENTS, convert to DOLLARS
        const insight = matchingInsights[0];
        const insightDate = insight.date ? formatInTimeZone(insight.date, "Australia/Sydney", "yyyy-MM-dd") : "N/A";
        const rangeStartAEST = insight.dateRange ? formatInTimeZone(insight.dateRange.start, "Australia/Sydney", "yyyy-MM-dd") : "N/A";
        const rangeEndAEST = insight.dateRange ? formatInTimeZone(insight.dateRange.end, "Australia/Sydney", "yyyy-MM-dd") : "N/A";
        
        result = [{
          adSpend: insight.metrics.spend / 100,  // Convert cents to dollars
          revenue: insight.metrics.revenue / 100, // Convert cents to dollars
          impressions: insight.metrics.impressions, // Already integer
          clicks: insight.metrics.clicks, // Already integer
          conversions: insight.metrics.conversions, // Already integer
        }];
        
        console.log(`[FacebookAdsRepo] ✅ Using single insight for ${queryAESTDay}:`, {
          insightDate: insightDate,
          dateRange: `${rangeStartAEST} to ${rangeEndAEST}`,
          adSpend: `$${result[0].adSpend.toFixed(2)}`,
          revenue: `$${result[0].revenue.toFixed(2)}`,
          conversions: result[0].conversions,
        });
      } else {
        // Multiple insights - this should be rare with strict filtering
        // Prefer exact date matches first, then shortest dateRange, then most recent
        console.log(`[FacebookAdsRepo] ⚠️ Multiple insights found for ${queryAESTDay}, selecting best match`);
        
        const insightsWithDuration = matchingInsights.map((insight) => {
          const rangeStart = new Date(insight.dateRange?.start || insight.date);
          const rangeEnd = new Date(insight.dateRange?.end || insight.date);
          const duration = rangeEnd.getTime() - rangeStart.getTime();
          const hasExactDate = insight.date && insight.date >= startDate && insight.date <= endDate;
          return { insight, duration, hasExactDate };
        });
        
        // Sort by: exact date match first, then shortest duration, then most recent
        insightsWithDuration.sort((a, b) => {
          // Prefer exact date matches
          if (a.hasExactDate && !b.hasExactDate) return -1;
          if (!a.hasExactDate && b.hasExactDate) return 1;
          
          // Then prefer shorter duration (more specific)
          if (a.duration !== b.duration) {
            return a.duration - b.duration;
          }
          
          // Finally, prefer most recent
          return new Date(b.insight.syncedAt).getTime() - new Date(a.insight.syncedAt).getTime();
        });
        
        const bestInsight = insightsWithDuration[0].insight;
        const bestDateAEST = bestInsight.date ? formatInTimeZone(bestInsight.date, "Australia/Sydney", "yyyy-MM-dd") : "N/A";
        const bestRangeStartAEST = bestInsight.dateRange ? formatInTimeZone(bestInsight.dateRange.start, "Australia/Sydney", "yyyy-MM-dd") : "N/A";
        const bestRangeEndAEST = bestInsight.dateRange ? formatInTimeZone(bestInsight.dateRange.end, "Australia/Sydney", "yyyy-MM-dd") : "N/A";
        
        console.log(`[FacebookAdsRepo] ✅ Selected best insight for ${queryAESTDay}:`, {
          insightDate: bestDateAEST,
          dateRange: `${bestRangeStartAEST} to ${bestRangeEndAEST}`,
          duration: `${Math.round(insightsWithDuration[0].duration / (24 * 60 * 60 * 1000) * 10) / 10} days`,
          hasExactDate: insightsWithDuration[0].hasExactDate,
        });
        
        // Convert from cents to dollars (both spend and revenue are stored in cents)
        result = [{
          adSpend: bestInsight.metrics.spend / 100,  // Convert cents to dollars
          revenue: bestInsight.metrics.revenue / 100, // Convert cents to dollars
          impressions: bestInsight.metrics.impressions, // Already integer
          clicks: bestInsight.metrics.clicks, // Already integer
          conversions: bestInsight.metrics.conversions, // Already integer
        }];
        
        console.log(`[FacebookAdsRepo] Metrics: adSpend=$${result[0].adSpend.toFixed(2)}, revenue=$${result[0].revenue.toFixed(2)}, conversions=${result[0].conversions}`);
        
        console.log(`[FacebookAdsRepo] Selected best insight (shortest dateRange):`, {
          dateRange: `${bestInsight.dateRange.start} to ${bestInsight.dateRange.end}`,
          duration: `${(insightsWithDuration[0].duration / (24 * 60 * 60 * 1000)).toFixed(1)} days`,
          adSpend: `$${result[0].adSpend}`,
          revenue: `$${result[0].revenue}`,
          conversions: result[0].conversions,
        });
      }
    } else {
      // Date range query - aggregate all matching insights
      // Note: This might still have some overlap issues, but for ranges we sum them
      const matchQuery = {
        $or: [
          {
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          },
          {
            "dateRange.start": { $lte: endDate },
            "dateRange.end": { $gte: startDate },
          },
        ],
        level: "account",
      };
      
      console.log(`[FacebookAdsRepo] Using match query for date range`);
      
      result = await FacebookAdsInsight.aggregate([
        {
          $match: matchQuery,
        },
        {
          $group: {
            _id: null,
            // NOTE: All metrics are stored in CENTS, will convert to dollars below
            adSpend: { $sum: "$metrics.spend" },
            revenue: { $sum: "$metrics.revenue" },
            impressions: { $sum: "$metrics.impressions" },
            clicks: { $sum: "$metrics.clicks" },
            conversions: { $sum: "$metrics.conversions" },
          },
        },
      ]).exec();
    }

    const aggregated = result[0] || {
      adSpend: 0,
      revenue: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    };

    console.log(`[FacebookAdsRepo] Aggregated result (raw, in cents):`, aggregated);

    // Convert all monetary values from cents to dollars
    // NOTE: Both spend and revenue are stored in CENTS in FacebookAdsInsight model
    // This matches how Stripe stores amounts (in cents) for consistency
    const final = {
      adSpend: aggregated.adSpend / 100,  // Convert cents to dollars
      revenue: aggregated.revenue / 100,  // Convert cents to dollars
      impressions: aggregated.impressions, // Already integer
      clicks: aggregated.clicks, // Already integer
      conversions: aggregated.conversions, // Already integer
    };
    
    console.log(`[FacebookAdsRepo] Final aggregated metrics (converted to dollars):`, final);
    
    return final;
  }
}

