import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { z } from "zod";
import FacebookAdsInsight from "@/models/FacebookAdsInsight";
import { fetchFacebookInsights, formatDateForFacebook, getTodayDateRange } from "@/lib/facebook-marketing";
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
  dateRange: z.enum(["today", "custom"]).default("today"),
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
 * - dateRange: 'today' | 'custom' (default: 'today')
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

    if (validatedQuery.dateRange === "today") {
      dateRange = getTodayDateRange();
      const today = new Date();
      startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
    } else {
      // Custom range
      startDate = new Date(validatedQuery.startDate!);
      endDate = new Date(validatedQuery.endDate!);
      dateRange = {
        since: formatDateForFacebook(startDate),
        until: formatDateForFacebook(endDate),
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
      if (validatedQuery.level === "account") {
        // Account level: aggregate all data
        metrics = insightsData[0].metrics;
      } else {
        // Campaign/Ad Set level: aggregate for summary, create breakdown items
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
        aggregated.roas = aggregated.spend > 0 ? aggregated.revenue / aggregated.spend : 0;
        aggregated.ctr = aggregated.impressions > 0 ? (aggregated.clicks / aggregated.impressions) * 100 : 0;
        aggregated.cpc = aggregated.clicks > 0 ? aggregated.spend / aggregated.clicks : 0;

        metrics = aggregated;

        // Create breakdown items for each campaign/adset
        breakdownItems = insightsData.map((item) => ({
          level: validatedQuery.level,
          campaignId: item.breakdown?.campaignId,
          campaignName: item.breakdown?.campaignName,
          adsetId: item.breakdown?.adsetId,
          adsetName: item.breakdown?.adsetName,
          spend: item.metrics.spend / 100, // Convert to dollars
          revenue: item.metrics.revenue / 100, // Convert to dollars
          profit: item.metrics.profit / 100, // Convert to dollars
          roas: item.metrics.roas,
          conversions: item.metrics.conversions,
          impressions: item.metrics.impressions,
          clicks: item.metrics.clicks,
          ctr: item.metrics.ctr,
          cpc: item.metrics.cpc / 100, // Convert to dollars
        }));
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

    // Calculate summary (convert from cents to dollars)
    const summary: FacebookAdsSummary = {
      spend: metrics.spend / 100,
      revenue: metrics.revenue / 100,
      profit: metrics.profit / 100,
      roas: metrics.roas,
      conversions: metrics.conversions,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      ctr: metrics.ctr,
      cpc: metrics.cpc / 100,
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
