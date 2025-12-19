import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import MajorDraw from "@/models/MajorDraw";
import { getStartOfTodayInAEST } from "@/utils/common/timezone";
import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import FacebookAdsInsight from "@/models/FacebookAdsInsight";
import { fetchFacebookInsights } from "@/lib/facebook-marketing";

/**
 * GET /api/admin/dashboard/stats
 * Get comprehensive dashboard statistics for admin overview
 *
 * Query Parameters:
 * - dateRange: "today" | "yesterday" | "all-time" | "custom" (default: "today")
 * - startDate: ISO date string (required if dateRange is "custom")
 * - endDate: ISO date string (required if dateRange is "custom")
 *
 * Returns real-time data for:
 * - User statistics (total, active subscriptions, new signups, profile completion)
 * - Revenue statistics (filtered by date range, breakdown by package type)
 * - Major draw statistics (total entries, active draws)
 * - Conversion rate (paying customers / total users)
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const dateRange = (searchParams.get("dateRange") as "today" | "yesterday" | "all-time" | "custom") || "today";
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    console.log("📊 Fetching admin dashboard stats...", { dateRange });

    // Calculate date range based on selection
    let startDate: Date;
    let endDate: Date = new Date(); // End date is always now

    const startOfToday = getStartOfTodayInAEST();

    switch (dateRange) {
      case "today":
        startDate = startOfToday;
        break;
      case "yesterday":
        // Get yesterday's start (24 hours before today's start)
        const yesterdayStart = subDays(startOfToday, 1);
        startDate = yesterdayStart;
        endDate = startOfToday; // End at start of today
        break;
      case "all-time":
        startDate = new Date(0); // Beginning of time
        break;
      case "custom":
        if (!startDateParam || !endDateParam) {
          return NextResponse.json({ error: "startDate and endDate are required for custom range" }, { status: 400 });
        }
        startDate = new Date(startDateParam);
        endDate = new Date(endDateParam);
        break;
      default:
        startDate = startOfToday;
    }

    // ========================================
    // USER STATISTICS
    // ========================================
    // For user stats, we always show all-time totals (not filtered by date range)
    // But new signups are filtered by date range
    const [totalUsers, activeSubscriptions, newSignupsInRange, usersWithCompletedProfiles] = await Promise.all([
      User.countDocuments({ isActive: true }),
      User.countDocuments({
        "subscription.isActive": true,
        isActive: true,
      }),
      User.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
        isActive: true,
      }),
      User.countDocuments({
        profileSetupCompleted: true,
        isActive: true,
      }),
    ]);

    // Calculate profile completion rate
    const profileCompletionRate = totalUsers > 0 ? Math.round((usersWithCompletedProfiles / totalUsers) * 100) : 0;

    // ========================================
    // REVENUE STATISTICS
    // ========================================
    // Get revenue from PaymentEvent model filtered by date range
    const revenueEvents = await PaymentEvent.find({
      eventType: "BenefitsGranted", // Only count successful payments
      timestamp: { $gte: startDate, $lte: endDate },
    });

    // Calculate revenue breakdowns
    let totalRevenue = 0;
    let subscriptionRevenue = 0;
    let oneTimeRevenue = 0; // Includes: one-time, upsell, mini-draw packages

    revenueEvents.forEach((event) => {
      const price = event.data?.price || 0;
      totalRevenue += price;

      // Package type breakdown
      if (event.packageType === "membership") {
        subscriptionRevenue += price;
      } else {
        // All non-subscription payments: one-time, upsell, mini-draw
        oneTimeRevenue += price;
      }
    });

    // ========================================
    // MAJOR DRAW STATISTICS
    // ========================================
    const [allMajorDraws, activeDrawsCount] = await Promise.all([
      MajorDraw.find({}).select("totalEntries"),
      MajorDraw.countDocuments({ status: "active" }),
    ]);

    // Calculate total entries across all major draws (all-time)
    const totalEntries = allMajorDraws.reduce((sum, draw) => sum + (draw.totalEntries || 0), 0);

    // ========================================
    // CONVERSION RATE (Date Range Aware)
    // ========================================
    // Calculate as: (Users who signed up in range AND have made a purchase) / (Users who signed up in range) * 100
    // For "all-time": (All paying users) / (All users) * 100

    let conversionRate = 0;

    if (dateRange === "all-time") {
      // All-time conversion rate: all paying users / all users
      const payingUsers = await User.countDocuments({
        $or: [
          { "subscription.isActive": true },
          { oneTimePackages: { $exists: true, $not: { $size: 0 } } },
          { miniDrawPackages: { $exists: true, $not: { $size: 0 } } },
        ],
        isActive: true,
      });
      conversionRate = totalUsers > 0 ? Math.round((payingUsers / totalUsers) * 100) : 0;
    } else {
      // Date-range specific conversion rate
      // Get users who signed up in the date range
      const usersInRange = newSignupsInRange; // Already calculated above

      // Get users who signed up in range AND have made at least one purchase (anytime)
      // This shows the conversion rate of users who signed up in that period
      const convertedUsersInRange = await User.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
        $or: [
          { "subscription.isActive": true },
          { oneTimePackages: { $exists: true, $not: { $size: 0 } } },
          { miniDrawPackages: { $exists: true, $not: { $size: 0 } } },
        ],
        isActive: true,
      });

      conversionRate = usersInRange > 0 ? Math.round((convertedUsersInRange / usersInRange) * 100) : 0;
    }

    // ========================================
    // FACEBOOK ADS STATISTICS
    // ========================================
    let facebookAdsSpend = 0;
    let facebookAdsRoas = 0;

    try {
      // Get environment variables
      const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
      const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;

      if (accessToken && adAccountId) {
        // Map dashboard date range to Facebook Ads date range
        let fbDateRange: { since: string; until: string };
        let fbStartDate: Date;
        let fbEndDate: Date;

        const AEST_TIMEZONE = "Australia/Sydney";

        if (dateRange === "today") {
          // Get today's date in AEST timezone for Facebook API
          const now = new Date();
          const todayYear = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "yyyy"), 10);
          const todayMonth = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "M"), 10);
          const todayDay = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "d"), 10);
          const todayDateStr = `${todayYear}-${String(todayMonth).padStart(2, "0")}-${String(todayDay).padStart(
            2,
            "0"
          )}`;

          fbDateRange = {
            since: todayDateStr,
            until: todayDateStr,
          };
          fbStartDate = startOfToday;
          const tomorrowStart = new Date(startOfToday);
          tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
          fbEndDate = new Date(tomorrowStart.getTime() - 1);
        } else if (dateRange === "yesterday") {
          const yesterdayStart = subDays(startOfToday, 1);
          fbStartDate = yesterdayStart;
          fbEndDate = new Date(startOfToday.getTime() - 1);

          const yesterdayYear = parseInt(formatInTimeZone(yesterdayStart, AEST_TIMEZONE, "yyyy"), 10);
          const yesterdayMonth = parseInt(formatInTimeZone(yesterdayStart, AEST_TIMEZONE, "M"), 10);
          const yesterdayDay = parseInt(formatInTimeZone(yesterdayStart, AEST_TIMEZONE, "d"), 10);
          const yesterdayDateStr = `${yesterdayYear}-${String(yesterdayMonth).padStart(2, "0")}-${String(
            yesterdayDay
          ).padStart(2, "0")}`;

          fbDateRange = {
            since: yesterdayDateStr,
            until: yesterdayDateStr,
          };
        } else if (dateRange === "all-time") {
          // For all-time, use a large date range (last 2 years)
          const allTimeStart = new Date();
          allTimeStart.setFullYear(allTimeStart.getFullYear() - 2);
          fbStartDate = allTimeStart;
          fbEndDate = new Date();

          const startYear = parseInt(formatInTimeZone(fbStartDate, AEST_TIMEZONE, "yyyy"), 10);
          const startMonth = parseInt(formatInTimeZone(fbStartDate, AEST_TIMEZONE, "M"), 10);
          const startDay = parseInt(formatInTimeZone(fbStartDate, AEST_TIMEZONE, "d"), 10);
          const startDateStr = `${startYear}-${String(startMonth).padStart(2, "0")}-${String(startDay).padStart(
            2,
            "0"
          )}`;

          const endYear = parseInt(formatInTimeZone(fbEndDate, AEST_TIMEZONE, "yyyy"), 10);
          const endMonth = parseInt(formatInTimeZone(fbEndDate, AEST_TIMEZONE, "M"), 10);
          const endDay = parseInt(formatInTimeZone(fbEndDate, AEST_TIMEZONE, "d"), 10);
          const endDateStr = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

          fbDateRange = {
            since: startDateStr,
            until: endDateStr,
          };
        } else {
          // Custom range
          fbStartDate = startDate;
          fbEndDate = endDate;

          const startYear = parseInt(formatInTimeZone(fbStartDate, AEST_TIMEZONE, "yyyy"), 10);
          const startMonth = parseInt(formatInTimeZone(fbStartDate, AEST_TIMEZONE, "M"), 10);
          const startDay = parseInt(formatInTimeZone(fbStartDate, AEST_TIMEZONE, "d"), 10);
          const startDateStr = `${startYear}-${String(startMonth).padStart(2, "0")}-${String(startDay).padStart(
            2,
            "0"
          )}`;

          const endYear = parseInt(formatInTimeZone(fbEndDate, AEST_TIMEZONE, "yyyy"), 10);
          const endMonth = parseInt(formatInTimeZone(fbEndDate, AEST_TIMEZONE, "M"), 10);
          const endDay = parseInt(formatInTimeZone(fbEndDate, AEST_TIMEZONE, "d"), 10);
          const endDateStr = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

          fbDateRange = {
            since: startDateStr,
            until: endDateStr,
          };
        }

        // Check cache (5 minute TTL)
        const CACHE_TTL_MS = 5 * 60 * 1000;
        const cacheKey = {
          adAccountId,
          "dateRange.start": fbStartDate,
          "dateRange.end": fbEndDate,
          level: "account",
        };

        const cachedData = await FacebookAdsInsight.findOne(cacheKey).sort({ syncedAt: -1 });
        let isCached = false;

        if (cachedData) {
          const cacheAge = Date.now() - new Date(cachedData.syncedAt).getTime();
          if (cacheAge < CACHE_TTL_MS) {
            isCached = true;
          }
        }

        let metrics: { spend: number; revenue: number; roas: number } | null = null;

        if (isCached && cachedData) {
          // Use cached data
          metrics = {
            spend: cachedData.metrics.spend / 100, // Convert cents to dollars
            revenue: cachedData.metrics.revenue / 100, // Convert cents to dollars
            roas: cachedData.calculated.roas,
          };
        } else {
          // Fetch fresh data
          try {
            const insightsData = await fetchFacebookInsights(adAccountId, accessToken, fbDateRange, "account");

            if (insightsData && insightsData.length > 0) {
              const firstInsight = insightsData[0];
              metrics = {
                spend: firstInsight.metrics.spend / 100, // Convert cents to dollars
                revenue: firstInsight.metrics.revenue / 100, // Convert cents to dollars
                roas: firstInsight.metrics.roas,
              };
            }
          } catch (error) {
            console.error("⚠️ Error fetching Facebook Ads insights:", error);
            // If we have cached data (even if expired), use it as fallback
            if (cachedData) {
              metrics = {
                spend: cachedData.metrics.spend / 100,
                revenue: cachedData.metrics.revenue / 100,
                roas: cachedData.calculated.roas,
              };
            }
          }
        }

        if (metrics) {
          facebookAdsSpend = metrics.spend;
          facebookAdsRoas = metrics.roas;
        }
      }
    } catch (error) {
      console.error("⚠️ Error fetching Facebook Ads stats:", error);
      // Gracefully degrade - return 0 values
    }

    // ========================================
    // RESPONSE
    // ========================================
    const stats = {
      users: {
        total: totalUsers,
        activeSubscriptions,
        newInRange: newSignupsInRange,
        profileCompletion: profileCompletionRate,
      },
      revenue: {
        total: totalRevenue,
        breakdown: {
          subscriptions: subscriptionRevenue,
          oneTimePackages: oneTimeRevenue,
        },
      },
      majorDraw: {
        totalEntries,
        activeDraws: activeDrawsCount,
      },
      conversionRate,
      facebookAds: {
        spend: facebookAdsSpend,
        roas: facebookAdsRoas,
      },
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        range: dateRange,
      },
    };

    console.log("✅ Admin dashboard stats calculated:", {
      totalUsers,
      activeSubscriptions,
      totalRevenue,
      totalEntries,
      conversionRate,
      dateRange,
    });

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("❌ Error fetching admin dashboard stats:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch dashboard statistics",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
