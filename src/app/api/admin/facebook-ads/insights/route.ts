import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { z } from "zod";
import FacebookAdsInsight from "@/models/FacebookAdsInsight";
import { fetchFacebookInsights } from "@/lib/facebook-marketing";
import { getStartOfTodayInAEST } from "@/utils/common/timezone";
import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type {
  FacebookAdsInsightsResponse,
  FacebookAdsSummary,
  FacebookAdsBreakdownItem,
  ProcessedInsightMetrics,
} from "@/types/facebook-ads";

/**
 * Query parameters validation schema
 * Uses Zod for type-safe validation
 */
const insightsQuerySchema = z.object({
  dateRange: z.enum(["today", "yesterday", "custom"]).default("today"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  level: z.enum(["account", "campaign", "adset"]).default("account"),
  refresh: z.string().optional(),
});

/**
 * Cache TTL in milliseconds (5 minutes)
 * This balances freshness with API rate limits
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * GET /api/admin/facebook-ads/insights
 * Fetch Facebook ad performance insights
 *
 * Features:
 * - Admin-only access with session validation
 * - Query parameter validation with Zod
 * - MongoDB caching (5 min TTL) to reduce API calls
 * - Graceful error handling with fallback to cached data
 * - Support for account/campaign/adset level breakdowns
 * - Real-time and custom date range support
 *
 * Query Parameters:
 * - dateRange: 'today' | 'yesterday' | 'custom' (default: 'today')
 * - startDate: ISO date string (required if dateRange === 'custom')
 * - endDate: ISO date string (required if dateRange === 'custom')
 * - level: 'account' | 'campaign' | 'adset' (default: 'account')
 * - refresh: boolean (default: false) - Force refresh, bypass cache
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get and validate query parameters
    const { searchParams } = new URL(request.url);
    const query = Object.fromEntries(searchParams.entries());

    let validatedQuery;
    try {
      const parsed = insightsQuerySchema.parse(query);
      // Transform refresh string to boolean
      validatedQuery = {
        ...parsed,
        refresh: parsed.refresh === "true",
      };
    } catch (validationError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid query parameters",
          details: validationError instanceof z.ZodError ? validationError.issues : "Validation failed",
        },
        { status: 400 }
      );
    }

    // Validate custom date range
    if (validatedQuery.dateRange === "custom") {
      if (!validatedQuery.startDate || !validatedQuery.endDate) {
        return NextResponse.json(
          {
            success: false,
            error: "startDate and endDate are required when dateRange is 'custom'",
          },
          { status: 400 }
        );
      }
    }

    // Get environment variables
    const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
    const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Facebook Marketing API access token not configured",
          details: "Please set FACEBOOK_MARKETING_ACCESS_TOKEN in environment variables",
        },
        { status: 500 }
      );
    }

    if (!adAccountId) {
      return NextResponse.json(
        {
          success: false,
          error: "Facebook Ad Account ID not configured",
          details: "Please set FACEBOOK_AD_ACCOUNT_ID in environment variables",
        },
        { status: 500 }
      );
    }

    // Determine date range
    let dateRange: { since: string; until: string };
    let startDate: Date;
    let endDate: Date;

    const startOfToday = getStartOfTodayInAEST();
    const AEST_TIMEZONE = "Australia/Sydney";

    if (validatedQuery.dateRange === "today") {
      // Get today's date in AEST timezone for Facebook API
      const now = new Date();
      const todayYear = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "yyyy"), 10);
      const todayMonth = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "M"), 10);
      const todayDay = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "d"), 10);
      const todayDateStr = `${todayYear}-${String(todayMonth).padStart(2, "0")}-${String(todayDay).padStart(2, "0")}`;

      dateRange = {
        since: todayDateStr,
        until: todayDateStr,
      };
      startDate = startOfToday;
      // End date is end of today in AEST (23:59:59.999)
      // Calculate by getting start of tomorrow and subtracting 1ms
      const tomorrowStart = new Date(startOfToday);
      tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
      endDate = new Date(tomorrowStart.getTime() - 1);
    } else if (validatedQuery.dateRange === "yesterday") {
      // Get yesterday's start (24 hours before today's start)
      const yesterdayStart = subDays(startOfToday, 1);
      const yesterdayEnd = new Date(startOfToday.getTime() - 1); // One millisecond before today starts
      startDate = yesterdayStart;
      endDate = yesterdayEnd;

      // Format yesterday's date in AEST for Facebook API
      const yesterdayYear = parseInt(formatInTimeZone(yesterdayStart, AEST_TIMEZONE, "yyyy"), 10);
      const yesterdayMonth = parseInt(formatInTimeZone(yesterdayStart, AEST_TIMEZONE, "M"), 10);
      const yesterdayDay = parseInt(formatInTimeZone(yesterdayStart, AEST_TIMEZONE, "d"), 10);
      const yesterdayDateStr = `${yesterdayYear}-${String(yesterdayMonth).padStart(2, "0")}-${String(
        yesterdayDay
      ).padStart(2, "0")}`;

      dateRange = {
        since: yesterdayDateStr,
        until: yesterdayDateStr, // Facebook API uses same date for single day
      };
    } else {
      // Custom range - parse dates and format in AEST
      startDate = new Date(validatedQuery.startDate!);
      endDate = new Date(validatedQuery.endDate!);

      // Format dates in AEST timezone for Facebook API
      const startYear = parseInt(formatInTimeZone(startDate, AEST_TIMEZONE, "yyyy"), 10);
      const startMonth = parseInt(formatInTimeZone(startDate, AEST_TIMEZONE, "M"), 10);
      const startDay = parseInt(formatInTimeZone(startDate, AEST_TIMEZONE, "d"), 10);
      const startDateStr = `${startYear}-${String(startMonth).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;

      const endYear = parseInt(formatInTimeZone(endDate, AEST_TIMEZONE, "yyyy"), 10);
      const endMonth = parseInt(formatInTimeZone(endDate, AEST_TIMEZONE, "M"), 10);
      const endDay = parseInt(formatInTimeZone(endDate, AEST_TIMEZONE, "d"), 10);
      const endDateStr = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

      dateRange = {
        since: startDateStr,
        until: endDateStr,
      };
    }

    // Check cache (unless refresh is forced)
    let cachedData = null;
    let isCached = false;

    if (!validatedQuery.refresh) {
      const cacheKey = {
        adAccountId,
        "dateRange.start": startDate,
        "dateRange.end": endDate,
        level: validatedQuery.level,
      };

      cachedData = await FacebookAdsInsight.findOne(cacheKey).sort({ syncedAt: -1 });

      // Check if cache is still valid (within TTL)
      if (cachedData) {
        const cacheAge = Date.now() - new Date(cachedData.syncedAt).getTime();
        if (cacheAge < CACHE_TTL_MS) {
          isCached = true;
          console.log("✅ Using cached Facebook ads insights");
        } else {
          // Cache expired, but we can still use it as fallback
          console.log("⚠️ Cache expired, fetching fresh data");
        }
      }
    }

    // Fetch fresh data from Facebook API
    let insightsData: Awaited<ReturnType<typeof fetchFacebookInsights>> | null = null;

    if (!isCached) {
      try {
        console.log("📊 Fetching Facebook ads insights from API...");
        insightsData = await fetchFacebookInsights(adAccountId, accessToken, dateRange, validatedQuery.level);

        // For campaign/adset levels, we need to fetch breakdown data
        // The API returns breakdown data in the same response when level is set
        // We'll process it below

        // Save to cache (account-level data only for now)
        // For campaign/adset levels, we'll process breakdown data below
        if (validatedQuery.level === "account" && insightsData.length > 0 && insightsData[0]) {
          const firstInsight = insightsData[0];
          const insightDoc = new FacebookAdsInsight({
            adAccountId,
            date: startDate,
            dateRange: {
              start: startDate,
              end: endDate,
            },
            level: validatedQuery.level,
            metrics: firstInsight.metrics,
            calculated: {
              profit: firstInsight.metrics.profit,
              roas: firstInsight.metrics.roas,
              ctr: firstInsight.metrics.ctr,
              cpc: firstInsight.metrics.cpc,
            },
            syncedAt: new Date(),
          });

          await insightDoc.save();
          console.log("✅ Facebook ads insights cached");
        }
      } catch (error) {
        console.error("❌ Error fetching Facebook insights:", error);

        // If we have cached data, use it as fallback
        if (cachedData) {
          console.log("⚠️ Using expired cache as fallback");
          isCached = true;
        } else {
          // No cache available, return error
          if (error instanceof Error) {
            // Handle specific Facebook API errors
            if (error.message.includes("token expired") || error.message.includes("invalid")) {
              return NextResponse.json(
                {
                  success: false,
                  error: "Facebook access token expired or invalid",
                  details: "Please update FACEBOOK_MARKETING_ACCESS_TOKEN in environment variables",
                },
                { status: 401 }
              );
            }

            if (error.message.includes("Rate limit")) {
              return NextResponse.json(
                {
                  success: false,
                  error: "Facebook API rate limit exceeded",
                  details: error.message,
                },
                { status: 429 }
              );
            }
          }

          return NextResponse.json(
            {
              success: false,
              error: "Failed to fetch Facebook insights",
              details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
          );
        }
      }
    }

    // Use cached or fresh data
    let metrics: ProcessedInsightMetrics;
    let breakdownItems: FacebookAdsBreakdownItem[] = [];

    if (isCached) {
      // Use cached data
      metrics = {
        spend: cachedData!.metrics.spend,
        revenue: cachedData!.metrics.revenue,
        impressions: cachedData!.metrics.impressions,
        clicks: cachedData!.metrics.clicks,
        conversions: cachedData!.metrics.conversions,
        profit: cachedData!.calculated.profit,
        roas: cachedData!.calculated.roas,
        ctr: cachedData!.calculated.ctr,
        cpc: cachedData!.calculated.cpc,
      };
    } else if (insightsData && insightsData.length > 0) {
      // Use fresh data from API
      // Note: All metrics from processInsightData are in CENTS
      if (validatedQuery.level === "account") {
        // Account level: use the single aggregated result
        // Facebook API returns account-level data as a single aggregated insight
        metrics = insightsData[0].metrics;
      } else {
        // Campaign/Ad Set level: aggregate multiple insights for summary, create breakdown items
        // Aggregate raw values (all in cents)
        const aggregated = insightsData.reduce(
          (acc, item) => ({
            spend: acc.spend + item.metrics.spend,
            revenue: acc.revenue + item.metrics.revenue,
            impressions: acc.impressions + item.metrics.impressions,
            clicks: acc.clicks + item.metrics.clicks,
            conversions: acc.conversions + item.metrics.conversions,
            profit: acc.profit + item.metrics.profit,
            roas: 0, // Will calculate below
            ctr: 0, // Will calculate below
            cpc: 0, // Will calculate below
          }),
          {
            spend: 0,
            revenue: 0,
            impressions: 0,
            clicks: 0,
            conversions: 0,
            profit: 0,
            roas: 0,
            ctr: 0,
            cpc: 0,
          }
        );

        // Calculate aggregated derived metrics
        // ROAS: revenue / spend (both in cents, so ratio is correct)
        aggregated.roas = aggregated.spend > 0 ? aggregated.revenue / aggregated.spend : 0;
        // CTR: (clicks / impressions) * 100
        aggregated.ctr = aggregated.impressions > 0 ? (aggregated.clicks / aggregated.impressions) * 100 : 0;
        // CPC: spend / clicks (both in cents, result is cents per click)
        aggregated.cpc = aggregated.clicks > 0 ? aggregated.spend / aggregated.clicks : 0;

        metrics = aggregated;

        // Create breakdown items for each campaign/adset
        // Convert from cents to dollars for display
        breakdownItems = insightsData.map((item) => {
          // Calculate individual item ROAS (revenue/spend, both in cents)
          const itemRoas = item.metrics.spend > 0 ? item.metrics.revenue / item.metrics.spend : 0;

          return {
            level: validatedQuery.level,
            campaignId: item.breakdown?.campaignId,
            campaignName: item.breakdown?.campaignName,
            adsetId: item.breakdown?.adsetId,
            adsetName: item.breakdown?.adsetName,
            spend: item.metrics.spend / 100, // Convert cents to dollars
            revenue: item.metrics.revenue / 100, // Convert cents to dollars
            profit: item.metrics.profit / 100, // Convert cents to dollars
            roas: itemRoas, // ROAS is a ratio, no conversion needed
            conversions: item.metrics.conversions,
            impressions: item.metrics.impressions,
            clicks: item.metrics.clicks,
            ctr: item.metrics.ctr, // Already a percentage
            cpc: item.metrics.cpc / 100, // Convert cents to dollars
          };
        });
      }
    } else {
      // No data available
      metrics = {
        spend: 0,
        revenue: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        profit: 0,
        roas: 0,
        ctr: 0,
        cpc: 0,
      };
    }

    // Calculate summary (convert from cents to dollars for monetary values)
    // Note: metrics are stored in cents, summary should be in dollars
    const summary: FacebookAdsSummary = {
      spend: metrics.spend / 100, // Convert cents to dollars
      revenue: metrics.revenue / 100, // Convert cents to dollars
      profit: metrics.profit / 100, // Convert cents to dollars
      roas: metrics.roas, // ROAS is a ratio (revenue/spend), no conversion needed
      conversions: metrics.conversions, // Count, no conversion needed
      impressions: metrics.impressions, // Count, no conversion needed
      clicks: metrics.clicks, // Count, no conversion needed
      ctr: metrics.ctr, // Percentage, already calculated correctly
      cpc: metrics.cpc / 100, // Convert cents to dollars
    };

    const response: FacebookAdsInsightsResponse = {
      success: true,
      data: {
        summary,
        breakdown: breakdownItems,
        dateRange: {
          start: dateRange.since,
          end: dateRange.until,
        },
        syncedAt: isCached ? cachedData!.syncedAt.toISOString() : new Date().toISOString(),
        cached: isCached,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ Error in Facebook ads insights API:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
