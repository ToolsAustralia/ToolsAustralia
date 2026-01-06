import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import MajorDraw from "@/models/MajorDraw";
import { getStartOfTodayInAEST, createAESTDateAsUTC, getWebsiteLaunchDateUTC } from "@/utils/common/timezone";
import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { fetchFacebookInsights } from "@/lib/facebook-marketing";
import mongoose from "mongoose";
import { DashboardMetricsService } from "@/services/admin/DashboardMetricsService";

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
    let endDate: Date;

    const startOfToday = getStartOfTodayInAEST();
    const AEST_TIMEZONE = "Australia/Sydney";
    
    // Get end of today in AEST (23:59:59.999) for proper date range
    const now = new Date();
    const todayYear = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "yyyy"), 10);
    const todayMonth = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "M"), 10);
    const todayDay = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "d"), 10);
    const endOfToday = createAESTDateAsUTC(todayYear, todayMonth, todayDay, 23, 59);
    endOfToday.setUTCSeconds(59, 999);
    
    // Default endDate to end of today
    endDate = endOfToday;

    switch (dateRange) {
      case "today":
        startDate = startOfToday;
        endDate = endOfToday;
        break;
      case "yesterday":
        // Get yesterday's start (24 hours before today's start)
        const yesterdayStart = subDays(startOfToday, 1);
        startDate = yesterdayStart;
        // End at end of yesterday (one millisecond before today starts)
        endDate = new Date(startOfToday.getTime() - 1);
        break;
      case "all-time":
        // Website launch date: November 27, 2025 at midnight AEST
        // End date: End of today (January 6, 2026)
        startDate = getWebsiteLaunchDateUTC();
        endDate = endOfToday;
        break;
      case "custom":
        if (!startDateParam || !endDateParam) {
          return NextResponse.json({ error: "startDate and endDate are required for custom range" }, { status: 400 });
        }
        // Parse dates and normalize to AEST start/end of day
        const startDateParsed = new Date(startDateParam);
        const endDateParsed = new Date(endDateParam);
        
        // Get date components in AEST
        const AEST_TIMEZONE = "Australia/Sydney";
        const startYear = parseInt(formatInTimeZone(startDateParsed, AEST_TIMEZONE, "yyyy"), 10);
        const startMonth = parseInt(formatInTimeZone(startDateParsed, AEST_TIMEZONE, "M"), 10);
        const startDay = parseInt(formatInTimeZone(startDateParsed, AEST_TIMEZONE, "d"), 10);
        
        const endYear = parseInt(formatInTimeZone(endDateParsed, AEST_TIMEZONE, "yyyy"), 10);
        const endMonth = parseInt(formatInTimeZone(endDateParsed, AEST_TIMEZONE, "M"), 10);
        const endDay = parseInt(formatInTimeZone(endDateParsed, AEST_TIMEZONE, "d"), 10);
        
        // Set startDate to start of day (00:00:00) in AEST
        startDate = createAESTDateAsUTC(startYear, startMonth, startDay, 0, 0);
        
        // Set endDate to end of day (23:59:59.999) in AEST
        // Calculate by getting start of next day and subtracting 1ms
        const nextDayStart = createAESTDateAsUTC(endYear, endMonth, endDay, 0, 0);
        const nextDay = new Date(nextDayStart);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        endDate = new Date(nextDay.getTime() - 1);
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
    // Use aggregation for better performance, especially for large date ranges
    const revenueEvents = await PaymentEvent.find({
      eventType: "BenefitsGranted", // Only count successful payments
      timestamp: { $gte: startDate, $lte: endDate },
    })
      .select("userId packageType data timestamp")
      .lean()
      .limit(10000); // Safety limit to prevent memory issues

    // Initialize detailed revenue breakdown
    let totalRevenue = 0;
    let membershipPurchase = 0;
    let membershipRenewal = 0;
    let oneTimePurchase = 0;
    let additionalOneTimePurchase = 0;
    let miniDraw = 0;
    let upsell = 0;

    // Get all one-time purchase events in the date range
    const oneTimeEvents = revenueEvents.filter((e) => e.packageType === "one-time");

    // For each one-time event, we need to check if there's a previous purchase
    // We'll batch this by getting all previous purchases for all users at once
    const userIds = [...new Set(oneTimeEvents.map((e) => e.userId.toString()))];
    const userIdObjectIds = userIds.map((id) => new mongoose.Types.ObjectId(id));

    // Get all previous one-time purchases for these users (before the date range)
    // This gives us users who definitely have previous purchases
    const usersWithPreviousPurchases = new Set<string>();
    if (userIds.length > 0) {
      const previousPurchases = await PaymentEvent.find({
        userId: { $in: userIdObjectIds },
        packageType: "one-time",
        eventType: "BenefitsGranted",
        timestamp: { $lt: startDate }, // Before the date range
      })
        .select("userId")
        .lean();

      previousPurchases.forEach((purchase) => {
        usersWithPreviousPurchases.add(purchase.userId.toString());
      });
    }

    // Track first purchase per user within the date range
    const firstPurchaseInRange = new Map<string, Date>();

    // Categorize revenue by package type and context
    // Sort events by timestamp to process them chronologically
    const sortedEvents = [...revenueEvents].sort((a, b) => {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });

    for (const event of sortedEvents) {
      const price = event.data?.price || 0;
      totalRevenue += price;

      if (event.packageType === "membership") {
        const billingReason = event.data?.billingReason as string | undefined;
        if (billingReason === "subscription_cycle") {
          membershipRenewal += price;
        } else {
          // subscription_create or undefined (treat as new purchase)
          membershipPurchase += price;
        }
      } else if (event.packageType === "mini-draw") {
        miniDraw += price;
      } else if (event.packageType === "upsell") {
        upsell += price;
      } else if (event.packageType === "one-time") {
        const userId = event.userId.toString();
        const eventTimestamp = new Date(event.timestamp);

        // Check if user has previous purchases before the date range
        if (usersWithPreviousPurchases.has(userId)) {
          // User has purchases before the range, so all purchases in range are additional
          additionalOneTimePurchase += price;
        } else {
          // User has no purchases before the range
          // Check if this is their first purchase in the current range
          const firstInRange = firstPurchaseInRange.get(userId);
          if (!firstInRange) {
            // This is their first purchase (both in range and ever)
            firstPurchaseInRange.set(userId, eventTimestamp);
            oneTimePurchase += price;
          } else {
            // User already made a first purchase in this range, this is additional
            additionalOneTimePurchase += price;
          }
        }
      }
    }

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
          // For all-time, use website launch date: November 27, 2025 at 8pm AEDT/AEST
          fbStartDate = getWebsiteLaunchDateUTC();
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

        // Fetch directly from Facebook API
        let metrics: { spend: number; revenue: number; roas: number } | null = null;

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
          // Return null if API fails - no fallback to stale data
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
    // ENHANCED METRICS (using service layer)
    // ========================================
    let enhancedMetrics = null;
    try {
      const dashboardMetricsService = new DashboardMetricsService();
      enhancedMetrics = await dashboardMetricsService.getEnhancedMetrics(startDate, endDate);
    } catch (error) {
      console.error("⚠️ Error fetching enhanced metrics:", error);
      // Gracefully degrade - enhanced metrics are optional
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
          subscriptions: membershipPurchase + membershipRenewal, // Backward compatibility
          oneTimePackages: oneTimePurchase + additionalOneTimePurchase + miniDraw + upsell, // Backward compatibility
          // Detailed breakdown
          membershipPurchase,
          membershipRenewal,
          oneTimePurchase,
          additionalOneTimePurchase,
          miniDraw,
          upsell,
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
      // Enhanced metrics (optional - only included if successfully calculated)
      ...(enhancedMetrics && { enhanced: enhancedMetrics }),
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
