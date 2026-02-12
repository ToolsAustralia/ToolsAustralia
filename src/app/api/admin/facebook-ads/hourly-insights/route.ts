import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { z } from "zod";
import { fetchFacebookInsightsHourly, fetchFacebookInsightsHourlyFiltered } from "@/lib/facebook-marketing";
import { PaymentEventRepository } from "@/repositories/PaymentEventRepository";
import { createAESTDateAsUTC } from "@/utils/common/timezone";
import type { HourlyInsightsResponse, HourlyInsightItem } from "@/types/facebook-ads";

/**
 * Query parameters validation schema
 */
const hourlyInsightsQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD format
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD format
  filterLevel: z.enum(["campaign", "adset", "ad"]).optional(),
  filterIds: z.string().optional(), // Comma-separated IDs, e.g. "id1,id2,id3"
});

/**
 * GET /api/admin/facebook-ads/hourly-insights
 * Fetch hourly ad performance: Facebook (spend, impressions, clicks) + your site (revenue, conversions).
 *
 * - Spend, impressions, clicks: from Facebook Marketing API (advertiser time zone).
 * - Revenue and conversions by hour: from your PaymentEvents (BenefitsGranted, purchases only —
 *   excludes membership renewals) for the selected date range in AEST; includes all traffic.
 * - Date range is interpreted as calendar days in Australia/Sydney (AEST/AEDT).
 *
 * Query Parameters:
 * - startDate: YYYY-MM-DD (required)
 * - endDate: YYYY-MM-DD (required)
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
      validatedQuery = hourlyInsightsQuerySchema.parse(query);
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

    // Build AEST date bounds for PaymentEvent query (same calendar days as the selected range)
    const startYear = parseInt(validatedQuery.startDate.slice(0, 4), 10);
    const startMonth = parseInt(validatedQuery.startDate.slice(5, 7), 10);
    const startDay = parseInt(validatedQuery.startDate.slice(8, 10), 10);
    const startOfRangeAEST = createAESTDateAsUTC(startYear, startMonth, startDay, 0, 0);

    const endYear = parseInt(validatedQuery.endDate.slice(0, 4), 10);
    const endMonth = parseInt(validatedQuery.endDate.slice(5, 7), 10);
    const endDay = parseInt(validatedQuery.endDate.slice(8, 10), 10);
    const endOfRangeAEST = createAESTDateAsUTC(endYear, endMonth, endDay, 23, 59);
    endOfRangeAEST.setUTCSeconds(59, 999);

    const filterLevel = validatedQuery.filterLevel;
    const filterIds = validatedQuery.filterIds
      ? validatedQuery.filterIds.split(",").map((id) => id.trim()).filter(Boolean)
      : [];

    console.log(
      `📊 [Hourly Insights] ${validatedQuery.startDate} to ${validatedQuery.endDate} (AEST)${filterIds.length ? `, filter: ${filterLevel} [${filterIds.length} ids]` : ""}`
    );

    // Fetch Facebook hourly (spend, impressions, clicks)
    let fbHourlyData;
    try {
      if (filterLevel && filterIds.length > 0) {
        fbHourlyData = await fetchFacebookInsightsHourlyFiltered(adAccountId, accessToken, {
          since: validatedQuery.startDate,
          until: validatedQuery.endDate,
        }, {
          level: filterLevel,
          filterIds,
        });
      } else {
        fbHourlyData = await fetchFacebookInsightsHourly(adAccountId, accessToken, {
          since: validatedQuery.startDate,
          until: validatedQuery.endDate,
        });
      }
    } catch (error) {
      console.error("❌ Error fetching Facebook hourly insights:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch Facebook hourly insights",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }

    // Fetch PaymentEvents for the exact date range in AEST (BenefitsGranted only, grouped by hour in AEST)
    const paymentEventRepo = new PaymentEventRepository();
    let dbHourlyData;
    try {
      dbHourlyData = await paymentEventRepo.aggregateRevenueAndCountByHourOfDay(startOfRangeAEST, endOfRangeAEST);
    } catch (error) {
      console.error("❌ Error fetching PaymentEvent hourly data:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch payment events for hourly breakdown",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }

    // Merge: Facebook (spend, impressions, clicks) + PaymentEvents (revenue, conversions by hour in AEST)
    const hourlyInsights: HourlyInsightItem[] = fbHourlyData.map((fbItem, hour) => {
      const spend = fbItem.spend / 100; // cents to dollars
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
        revenue,
        conversions,
        profit,
        roas,
        ctr,
        cpc,
      };
    });

    const totalConversions = hourlyInsights.reduce((s, h) => s + h.conversions, 0);
    const totalRevenue = hourlyInsights.reduce((s, h) => s + h.revenue, 0);

    const response: HourlyInsightsResponse = {
      success: true,
      data: {
        hourly: hourlyInsights,
        totalConversions,
        totalRevenue,
        dateRange: {
          start: validatedQuery.startDate,
          end: validatedQuery.endDate,
        },
      },
    };

    console.log(`✅ [Hourly Insights] ${hourlyInsights.length} hours, PaymentEvents totalConversions=${totalConversions}, totalRevenue=${totalRevenue.toFixed(2)}`);

    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ Error in Facebook hourly insights API:", error);
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

/**
 * Format hour (0-23) as human-readable label
 * @param hour - Hour (0-23)
 * @returns Formatted label (e.g. "12:00 AM", "1:00 PM")
 */
function formatHourLabel(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:00 ${period}`;
}
