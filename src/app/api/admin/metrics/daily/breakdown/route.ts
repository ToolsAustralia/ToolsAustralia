import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import FacebookAdsInsight from "@/models/FacebookAdsInsight";
import { fetchFacebookInsights } from "@/lib/facebook-marketing";
import { formatInTimeZone } from "date-fns-tz";
import { createAESTDateAsUTC } from "@/utils/common/timezone";
import { handleApiError } from "@/lib/errors/handlers";

const AEST_TIMEZONE = "Australia/Sydney";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/admin/metrics/daily/breakdown
 * Fetch breakdown items (campaigns, adsets, ads) for a date range
 * 
 * Query Parameters:
 * - startDate: ISO date string (required)
 * - endDate: ISO date string (required)
 * - level: "campaign" | "adset" | "ad" (required)
 * - campaignId: string (optional, for filtering adsets/ads by campaign)
 * - adsetId: string (optional, for filtering ads by adset)
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // 1. Authentication & Authorization
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Admin access required" } },
        { status: 401 }
      );
    }

    // 2. Input Validation
    const { searchParams } = new URL(request.url);
    const startDateStr = searchParams.get("startDate");
    const endDateStr = searchParams.get("endDate");
    const level = searchParams.get("level") as "campaign" | "adset" | "ad" | null;
    const campaignId = searchParams.get("campaignId") || undefined;
    const adsetId = searchParams.get("adsetId") || undefined;

    if (!startDateStr || !endDateStr || !level) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "startDate, endDate, and level are required" } },
        { status: 400 }
      );
    }

    if (!["campaign", "adset", "ad"].includes(level)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "level must be campaign, adset, or ad" } },
        { status: 400 }
      );
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid date format" } },
        { status: 400 }
      );
    }

    const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
    const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;

    if (!adAccountId || !accessToken) {
      return NextResponse.json(
        { error: { code: "CONFIG_ERROR", message: "Facebook API credentials not configured" } },
        { status: 500 }
      );
    }

    // 3. Aggregate breakdown items from cache or API
    const breakdownMap = new Map<string, {
      id: string;
      name: string;
      adSpend: number;
      revenue: number;
      profit: number;
      roas: number;
      conversions: number;
      impressions: number;
      clicks: number;
    }>();

    // Get all days in range
    const days: Date[] = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      days.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // For each day, fetch or use cached breakdown data
    for (const day of days) {
      const year = parseInt(formatInTimeZone(day, AEST_TIMEZONE, "yyyy"), 10);
      const month = parseInt(formatInTimeZone(day, AEST_TIMEZONE, "M"), 10);
      const dayNum = parseInt(formatInTimeZone(day, AEST_TIMEZONE, "d"), 10);
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;

      const startOfDay = createAESTDateAsUTC(year, month, dayNum, 0, 0);
      const endOfDay = createAESTDateAsUTC(year, month, dayNum, 23, 59);
      endOfDay.setUTCSeconds(59, 999);

      // Check cache
      const cacheQuery: any = {
        adAccountId,
        "dateRange.start": startOfDay,
        "dateRange.end": endOfDay,
        level,
      };

      // Add filters based on level
      if (level === "adset" && campaignId) {
        cacheQuery["breakdown.campaignId"] = campaignId;
      } else if (level === "ad") {
        if (adsetId) {
          cacheQuery["breakdown.adsetId"] = adsetId;
        } else if (campaignId) {
          cacheQuery["breakdown.campaignId"] = campaignId;
        }
      }

      let cachedData = await FacebookAdsInsight.find(cacheQuery).sort({ syncedAt: -1 });
      let isCached = false;

      if (cachedData.length > 0) {
        const mostRecent = cachedData[0];
        const cacheAge = Date.now() - new Date(mostRecent.syncedAt).getTime();
        if (cacheAge < CACHE_TTL_MS) {
          isCached = true;
        }
      }

      // Fetch from API if cache expired or missing
      if (!isCached || cachedData.length === 0) {
        try {
          const insightsData = await fetchFacebookInsights(
            adAccountId,
            accessToken,
            { since: dateStr, until: dateStr },
            level
          );

          if (insightsData && insightsData.length > 0) {
            // Save to cache
            for (const insight of insightsData) {
              if (insight.breakdown) {
                const insightDoc = new FacebookAdsInsight({
                  adAccountId,
                  date: startOfDay,
                  dateRange: {
                    start: startOfDay,
                    end: endOfDay,
                  },
                  level,
                  breakdown: insight.breakdown,
                  metrics: insight.metrics,
                  calculated: {
                    profit: insight.metrics.profit,
                    roas: insight.metrics.roas,
                    ctr: insight.metrics.ctr,
                    cpc: insight.metrics.cpc,
                  },
                  syncedAt: new Date(),
                });
                await insightDoc.save();
              }
            }

            // Use fresh data - convert to format compatible with cachedData structure
            // After saving to cache, query it back to get consistent structure
            cachedData = await FacebookAdsInsight.find(cacheQuery).sort({ syncedAt: -1 });
          }
        } catch (error) {
          console.error(`Error fetching breakdown for ${dateStr}:`, error);
          // Continue with cached data if available
        }
      }

      // Aggregate breakdown items
      for (const item of cachedData) {
        if (!item.breakdown) continue;

        let id: string;
        let name: string;

        if (level === "campaign") {
          id = item.breakdown.campaignId || "";
          name = item.breakdown.campaignName || "Unknown Campaign";
        } else if (level === "adset") {
          id = item.breakdown.adsetId || "";
          name = item.breakdown.adsetName || "Unknown Adset";
          // Filter by campaign if specified
          if (campaignId && item.breakdown.campaignId !== campaignId) continue;
        } else {
          id = item.breakdown.adId || "";
          name = item.breakdown.adName || "Unknown Ad";
          // Filter by adset or campaign if specified
          if (adsetId && item.breakdown.adsetId !== adsetId) continue;
          if (campaignId && item.breakdown.campaignId !== campaignId) continue;
        }

        if (!id) continue;

        const existing = breakdownMap.get(id);
        if (existing) {
          existing.adSpend += item.metrics.spend / 100;
          existing.revenue += item.metrics.revenue / 100;
          existing.profit += item.metrics.profit / 100;
          existing.conversions += item.metrics.conversions;
          existing.impressions += item.metrics.impressions;
          existing.clicks += item.metrics.clicks;
          existing.roas = existing.adSpend > 0 ? existing.revenue / existing.adSpend : 0;
        } else {
          breakdownMap.set(id, {
            id,
            name,
            adSpend: item.metrics.spend / 100,
            revenue: item.metrics.revenue / 100,
            profit: item.metrics.profit / 100,
            roas: item.metrics.spend > 0 ? item.metrics.revenue / item.metrics.spend : 0,
            conversions: item.metrics.conversions,
            impressions: item.metrics.impressions,
            clicks: item.metrics.clicks,
          });
        }
      }
    }

    const breakdownItems = Array.from(breakdownMap.values());

    return NextResponse.json(
      {
        data: breakdownItems,
        meta: {
          timestamp: new Date().toISOString(),
          count: breakdownItems.length,
          level,
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, max-age=300",
        },
      }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

