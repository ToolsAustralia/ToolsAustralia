import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { fetchNetBenefitsGrantedInRange } from "@/utils/payment/payment-event-net-queries";
import MajorDraw from "@/models/MajorDraw";
import { getStartOfTodayInAEST, createAESTDateAsUTC, getWebsiteLaunchDateUTC } from "@/utils/common/timezone";
import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { fetchFacebookInsights } from "@/lib/facebook-marketing";
import { DashboardMetricsService } from "@/services/admin/DashboardMetricsService";
import { getActiveSubscriptionFilter, getEverPaidUserFilter } from "@/utils/admin/userFilterBuilder";
import { trendCalculationService } from "@/services/admin/TrendCalculationService";

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
    const dateRange = (searchParams.get("dateRange") as "today" | "yesterday" | "all-time" | "custom" | "current-draw" | "last-draw") || "today";
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
      case "current-draw":
      case "last-draw": {
        // For draw-based ranges, use the provided startDate and endDate params
        // These are set by the frontend from the draw dates
        if (!startDateParam || !endDateParam) {
          return NextResponse.json(
            { error: "startDate and endDate are required for draw-based ranges" },
            { status: 400 }
          );
        }
        // Parse dates and normalize to AEST start/end of day
        const drawStartDateParsed = new Date(startDateParam);
        const drawEndDateParsed = new Date(endDateParam);
        
        // Get date components in AEST
        const drawStartYear = parseInt(formatInTimeZone(drawStartDateParsed, AEST_TIMEZONE, "yyyy"), 10);
        const drawStartMonth = parseInt(formatInTimeZone(drawStartDateParsed, AEST_TIMEZONE, "M"), 10);
        const drawStartDay = parseInt(formatInTimeZone(drawStartDateParsed, AEST_TIMEZONE, "d"), 10);
        
        const drawEndYear = parseInt(formatInTimeZone(drawEndDateParsed, AEST_TIMEZONE, "yyyy"), 10);
        const drawEndMonth = parseInt(formatInTimeZone(drawEndDateParsed, AEST_TIMEZONE, "M"), 10);
        const drawEndDay = parseInt(formatInTimeZone(drawEndDateParsed, AEST_TIMEZONE, "d"), 10);
        
        // Set startDate to start of day (00:00:00) in AEST
        startDate = createAESTDateAsUTC(drawStartYear, drawStartMonth, drawStartDay, 0, 0);
        
        // Set endDate to end of day (23:59:59.999) in AEST
        const drawNextDayStart = createAESTDateAsUTC(drawEndYear, drawEndMonth, drawEndDay, 0, 0);
        const drawNextDay = new Date(drawNextDayStart);
        drawNextDay.setUTCDate(drawNextDay.getUTCDate() + 1);
        endDate = new Date(drawNextDay.getTime() - 1);
        break;
      }
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
    // COMPARISON PERIOD (for trend calculation)
    // ========================================
    const includeTrends = dateRange !== "all-time";
    let comparisonStartDate: Date | null = null;
    let comparisonEndDate: Date | null = null;

    if (includeTrends) {
      const comparison = trendCalculationService.getComparisonPeriod(startDate, endDate);
      comparisonStartDate = comparison.start;
      comparisonEndDate = comparison.end;
    }

    // ========================================
    // USER STATISTICS
    // ========================================
    // For user stats, we always show all-time totals (not filtered by date range)
    // But new signups are filtered by date range
    // Cancelled memberships: date-dependent
    // - all-time: total users with scheduled cancellation (endDate + autoRenew false)
    // - today/yesterday/custom/etc: cancellations that happened in the selected period (cancelledAt in range)
    const cancelledMembershipsQuery =
      dateRange === "all-time"
        ? {
            "subscription.endDate": { $exists: true, $ne: null },
            "subscription.autoRenew": false,
            "subscription.status": { $in: ["active", "past_due"] },
            isActive: true,
          }
        : {
            "subscription.cancelledAt": { $gte: startDate, $lte: endDate },
            isActive: true,
          };

    // totalScheduledCancellation: always the "stock" count (members currently scheduled to cancel)
    const totalScheduledCancellationQuery = {
      "subscription.endDate": { $exists: true, $ne: null },
      "subscription.autoRenew": false,
      "subscription.status": { $in: ["active", "past_due"] },
      isActive: true,
    };

    const [totalUsers, activeSubscriptions, newSignupsInRange, usersWithCompletedProfiles, cancelledMemberships, totalScheduledCancellation] = await Promise.all([
      User.countDocuments({ isActive: true }),
      // Active subscriptions: only count subscriptions that will auto-renew (matches projected income calculation)
      User.countDocuments(getActiveSubscriptionFilter()),
      User.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
        isActive: true,
      }),
      User.countDocuments({
        profileSetupCompleted: true,
        isActive: true,
      }),
      User.countDocuments(cancelledMembershipsQuery),
      User.countDocuments(totalScheduledCancellationQuery),
    ]);

    // Drop-off rate: % of membership base (active + scheduled) that has scheduled cancellation
    const membershipBase = activeSubscriptions + totalScheduledCancellation;
    const dropOffRate =
      membershipBase > 0
        ? Math.round((totalScheduledCancellation / membershipBase) * 1000) / 10
        : 0;

    // Period churn rate: % of active subscribers who cancelled in the selected period (only when not all-time)
    const periodChurnRate =
      dateRange !== "all-time" && activeSubscriptions > 0
        ? Math.round((cancelledMemberships / activeSubscriptions) * 10000) / 100
        : undefined;

    // Calculate profile completion rate
    const profileCompletionRate = totalUsers > 0 ? Math.round((usersWithCompletedProfiles / totalUsers) * 100) : 0;

    // ========================================
    // REVENUE STATISTICS (net: exclude BenefitsGranted with RefundProcessed — Option B)
    // ========================================
    const revenueEvents = await fetchNetBenefitsGrantedInRange(startDate, endDate, {
      userId: 1,
      packageType: 1,
      packageId: 1,
      data: 1,
      timestamp: 1,
    });

    // Initialize detailed revenue breakdown with counts
    let totalRevenue = 0;
    
    // Revenue and count tracking for each category
    const membershipPurchaseData = { revenue: 0, purchaseCount: 0, userIds: new Set<string>() };
    const membershipRenewalData = { revenue: 0, purchaseCount: 0, userIds: new Set<string>() };
    const oneTimePurchaseData = { revenue: 0, purchaseCount: 0, userIds: new Set<string>() };
    const additionalOneTimePurchaseData = { revenue: 0, purchaseCount: 0, userIds: new Set<string>() };
    const miniDrawData = { revenue: 0, purchaseCount: 0, userIds: new Set<string>() };
    const upsellData = { revenue: 0, purchaseCount: 0, userIds: new Set<string>() };

    // Categorize revenue by package type and context
    // Sort events by timestamp to process them chronologically
    const sortedEvents = [...revenueEvents].sort((a, b) => {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });

    for (const event of sortedEvents) {
      const price = event.data?.price || 0;
      totalRevenue += price;
      const userId = event.userId?.toString() || "";

      if (event.packageType === "membership") {
        const billingReason = event.data?.billingReason as string | undefined;
        if (billingReason === "subscription_cycle") {
          membershipRenewalData.revenue += price;
          membershipRenewalData.purchaseCount += 1;
          if (userId) membershipRenewalData.userIds.add(userId);
        } else {
          // subscription_create or undefined (treat as new purchase)
          membershipPurchaseData.revenue += price;
          membershipPurchaseData.purchaseCount += 1;
          if (userId) membershipPurchaseData.userIds.add(userId);
        }
      } else if (event.packageType === "mini-draw") {
        miniDrawData.revenue += price;
        miniDrawData.purchaseCount += 1;
        if (userId) miniDrawData.userIds.add(userId);
      } else if (event.packageType === "upsell") {
        upsellData.revenue += price;
        upsellData.purchaseCount += 1;
        if (userId) upsellData.userIds.add(userId);
      } else if (event.packageType === "one-time") {
        // Categorize based on packageId:
        // - "One-Time Additional" = packages that start with "additional-" (e.g., "additional-apprentice-pack")
        // - "One-Time First" = packages that end with "-pack" but NOT "additional-*-pack" (e.g., "apprentice-pack", "tradie-pack")
        const packageId = event.packageId || "";
        
        if (packageId.startsWith("additional-")) {
          // This is an additional package (member-only packages)
          additionalOneTimePurchaseData.revenue += price;
          additionalOneTimePurchaseData.purchaseCount += 1;
          if (userId) additionalOneTimePurchaseData.userIds.add(userId);
        } else if (packageId.endsWith("-pack")) {
          // This is a first-time package (regular one-time packages)
          oneTimePurchaseData.revenue += price;
          oneTimePurchaseData.purchaseCount += 1;
          if (userId) oneTimePurchaseData.userIds.add(userId);
        } else {
          // Fallback: If packageId doesn't match expected pattern, treat as first-time
          // This handles edge cases where packageId might be missing or in unexpected format
          oneTimePurchaseData.revenue += price;
          oneTimePurchaseData.purchaseCount += 1;
          if (userId) oneTimePurchaseData.userIds.add(userId);
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
      // All-time conversion rate: all paying users / all users (ever made a purchase)
      const payingUsers = await User.countDocuments(getEverPaidUserFilter());
      conversionRate = totalUsers > 0 ? Math.round((payingUsers / totalUsers) * 100) : 0;
    } else {
      // Date-range specific conversion rate
      // Get users who signed up in the date range
      const usersInRange = newSignupsInRange; // Already calculated above

      // Get users who signed up in range AND have made at least one purchase (ever)
      // This shows the conversion rate of users who signed up in that period
      const convertedUsersInRange = await User.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
        ...getEverPaidUserFilter(false),
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
    // COMPARISON PERIOD METRICS (for trends)
    // ========================================
    let totalUsersTrend = undefined;
    let newInRangeTrend = undefined;
    let cancelledMembershipsTrend = undefined;
    let dropOffRateTrend = undefined;
    let totalRevenueTrend = undefined;
    let conversionRateTrend = undefined;
    let adSpendTrend = undefined;
    let roasTrend = undefined;
    const revenueBreakdownTrends: Record<
      string,
      { value: number; direction: "up" | "down" | "neutral"; previousValue?: number }
    > = {};

    if (includeTrends && comparisonStartDate && comparisonEndDate) {
      const cancelledMembershipsComparisonQuery = {
        "subscription.cancelledAt": { $gte: comparisonStartDate, $lte: comparisonEndDate },
        isActive: true,
      };

      // previousTotalScheduledCancellation: scheduled to cancel as of end of comparison period (endDate was still in future)
      const previousTotalScheduledCancellationQuery = {
        "subscription.endDate": { $gt: comparisonEndDate },
        "subscription.autoRenew": false,
        "subscription.status": { $in: ["active", "past_due"] },
        isActive: true,
      };

      const [
        previousTotalUsers,
        previousNewSignupsInRange,
        previousCancelledMemberships,
        previousTotalScheduledCancellation,
        previousRevenueEvents,
      ] = await Promise.all([
        User.countDocuments({ isActive: true, createdAt: { $lte: comparisonEndDate } }),
        User.countDocuments({
          createdAt: { $gte: comparisonStartDate, $lte: comparisonEndDate },
          isActive: true,
        }),
        User.countDocuments(cancelledMembershipsComparisonQuery),
        User.countDocuments(previousTotalScheduledCancellationQuery),
        fetchNetBenefitsGrantedInRange(comparisonStartDate, comparisonEndDate, {
          userId: 1,
          packageType: 1,
          packageId: 1,
          data: 1,
          timestamp: 1,
        }),
      ]);

      let previousTotalRevenue = 0;
      const previousMembershipPurchaseData = { revenue: 0 };
      const previousMembershipRenewalData = { revenue: 0 };
      const previousOneTimePurchaseData = { revenue: 0 };
      const previousAdditionalOneTimePurchaseData = { revenue: 0 };
      const previousMiniDrawData = { revenue: 0 };
      const previousUpsellData = { revenue: 0 };

      for (const event of previousRevenueEvents) {
        const price = event.data?.price || 0;
        previousTotalRevenue += price;

        if (event.packageType === "membership") {
          const billingReason = event.data?.billingReason as string | undefined;
          if (billingReason === "subscription_cycle") {
            previousMembershipRenewalData.revenue += price;
          } else {
            previousMembershipPurchaseData.revenue += price;
          }
        } else if (event.packageType === "mini-draw") {
          previousMiniDrawData.revenue += price;
        } else if (event.packageType === "upsell") {
          previousUpsellData.revenue += price;
        } else if (event.packageType === "one-time") {
          const packageId = event.packageId || "";
          if (packageId.startsWith("additional-")) {
            previousAdditionalOneTimePurchaseData.revenue += price;
          } else {
            previousOneTimePurchaseData.revenue += price;
          }
        }
      }

      let previousConversionRate = 0;
      const previousConvertedUsersInRange = await User.countDocuments({
        createdAt: { $gte: comparisonStartDate, $lte: comparisonEndDate },
        ...getEverPaidUserFilter(false),
        isActive: true,
      });
      previousConversionRate =
        previousNewSignupsInRange > 0
          ? Math.round((previousConvertedUsersInRange / previousNewSignupsInRange) * 100)
          : 0;

      let previousFacebookAdsSpend = 0;
      let previousFacebookAdsRoas = 0;
      try {
        const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
        const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
        if (accessToken && adAccountId) {
          const compStartYear = parseInt(
            formatInTimeZone(comparisonStartDate, AEST_TIMEZONE, "yyyy"),
            10
          );
          const compStartMonth = parseInt(
            formatInTimeZone(comparisonStartDate, AEST_TIMEZONE, "M"),
            10
          );
          const compStartDay = parseInt(
            formatInTimeZone(comparisonStartDate, AEST_TIMEZONE, "d"),
            10
          );
          const compEndYear = parseInt(formatInTimeZone(comparisonEndDate, AEST_TIMEZONE, "yyyy"), 10);
          const compEndMonth = parseInt(formatInTimeZone(comparisonEndDate, AEST_TIMEZONE, "M"), 10);
          const compEndDay = parseInt(formatInTimeZone(comparisonEndDate, AEST_TIMEZONE, "d"), 10);
          const compDateStr = `${compStartYear}-${String(compStartMonth).padStart(2, "0")}-${String(compStartDay).padStart(2, "0")}`;
          const compEndDateStr = `${compEndYear}-${String(compEndMonth).padStart(2, "0")}-${String(compEndDay).padStart(2, "0")}`;

          const compInsightsData = await fetchFacebookInsights(
            adAccountId,
            accessToken,
            { since: compDateStr, until: compEndDateStr },
            "account"
          );
          if (compInsightsData && compInsightsData.length > 0) {
            previousFacebookAdsSpend = compInsightsData[0].metrics.spend / 100;
            previousFacebookAdsRoas = compInsightsData[0].metrics.roas;
          }
        }
      } catch {
        // Ignore - use 0 for comparison
      }

      totalUsersTrend = trendCalculationService.calculateTrend(totalUsers, previousTotalUsers);
      newInRangeTrend = trendCalculationService.calculateTrend(newSignupsInRange, previousNewSignupsInRange);

      const previousMembershipBase = activeSubscriptions + previousTotalScheduledCancellation;
      const previousDropOffRate =
        previousMembershipBase > 0
          ? Math.round((previousTotalScheduledCancellation / previousMembershipBase) * 1000) / 10
          : 0;
      dropOffRateTrend = trendCalculationService.calculateTrend(dropOffRate, previousDropOffRate, {
        invertedPositive: true,
      });

      cancelledMembershipsTrend = trendCalculationService.calculateTrend(
        cancelledMemberships,
        previousCancelledMemberships,
        { invertedPositive: true }
      );
      totalRevenueTrend = trendCalculationService.calculateTrend(totalRevenue, previousTotalRevenue);
      conversionRateTrend = trendCalculationService.calculateTrend(
        conversionRate,
        previousConversionRate
      );
      adSpendTrend = trendCalculationService.calculateTrend(
        facebookAdsSpend,
        previousFacebookAdsSpend
      );
      roasTrend = trendCalculationService.calculateTrend(facebookAdsRoas, previousFacebookAdsRoas);

      revenueBreakdownTrends.membershipPurchase = trendCalculationService.calculateTrend(
        membershipPurchaseData.revenue,
        previousMembershipPurchaseData.revenue
      );
      revenueBreakdownTrends.membershipRenewal = trendCalculationService.calculateTrend(
        membershipRenewalData.revenue,
        previousMembershipRenewalData.revenue
      );
      revenueBreakdownTrends.oneTimePurchase = trendCalculationService.calculateTrend(
        oneTimePurchaseData.revenue,
        previousOneTimePurchaseData.revenue
      );
      revenueBreakdownTrends.additionalOneTimePurchase = trendCalculationService.calculateTrend(
        additionalOneTimePurchaseData.revenue,
        previousAdditionalOneTimePurchaseData.revenue
      );
      revenueBreakdownTrends.miniDraw = trendCalculationService.calculateTrend(
        miniDrawData.revenue,
        previousMiniDrawData.revenue
      );
      revenueBreakdownTrends.upsell = trendCalculationService.calculateTrend(
        upsellData.revenue,
        previousUpsellData.revenue
      );
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
        ...(totalUsersTrend && { totalTrend: totalUsersTrend }),
        activeSubscriptions,
        newInRange: newSignupsInRange,
        ...(newInRangeTrend && { newInRangeTrend }),
        profileCompletion: profileCompletionRate,
        cancelledMemberships,
        ...(cancelledMembershipsTrend && { cancelledMembershipsTrend }),
        totalScheduledCancellation,
        dropOffRate,
        ...(periodChurnRate != null && { periodChurnRate }),
        ...(dropOffRateTrend && { dropOffRateTrend }),
      },
      revenue: {
        total: totalRevenue,
        ...(totalRevenueTrend && { totalTrend: totalRevenueTrend }),
        breakdown: {
          subscriptions: membershipPurchaseData.revenue + membershipRenewalData.revenue, // Backward compatibility
          oneTimePackages: oneTimePurchaseData.revenue + additionalOneTimePurchaseData.revenue + miniDrawData.revenue + upsellData.revenue, // Backward compatibility
          // Detailed breakdown with counts
          membershipPurchase: {
            revenue: membershipPurchaseData.revenue,
            purchaseCount: membershipPurchaseData.purchaseCount,
            userCount: membershipPurchaseData.userIds.size,
            ...(revenueBreakdownTrends.membershipPurchase && {
              trend: revenueBreakdownTrends.membershipPurchase,
            }),
          },
          membershipRenewal: {
            revenue: membershipRenewalData.revenue,
            purchaseCount: membershipRenewalData.purchaseCount,
            userCount: membershipRenewalData.userIds.size,
            ...(revenueBreakdownTrends.membershipRenewal && {
              trend: revenueBreakdownTrends.membershipRenewal,
            }),
          },
          oneTimePurchase: {
            revenue: oneTimePurchaseData.revenue,
            purchaseCount: oneTimePurchaseData.purchaseCount,
            userCount: oneTimePurchaseData.userIds.size,
            ...(revenueBreakdownTrends.oneTimePurchase && {
              trend: revenueBreakdownTrends.oneTimePurchase,
            }),
          },
          additionalOneTimePurchase: {
            revenue: additionalOneTimePurchaseData.revenue,
            purchaseCount: additionalOneTimePurchaseData.purchaseCount,
            userCount: additionalOneTimePurchaseData.userIds.size,
            ...(revenueBreakdownTrends.additionalOneTimePurchase && {
              trend: revenueBreakdownTrends.additionalOneTimePurchase,
            }),
          },
          miniDraw: {
            revenue: miniDrawData.revenue,
            purchaseCount: miniDrawData.purchaseCount,
            userCount: miniDrawData.userIds.size,
            ...(revenueBreakdownTrends.miniDraw && { trend: revenueBreakdownTrends.miniDraw }),
          },
          upsell: {
            revenue: upsellData.revenue,
            purchaseCount: upsellData.purchaseCount,
            userCount: upsellData.userIds.size,
            ...(revenueBreakdownTrends.upsell && { trend: revenueBreakdownTrends.upsell }),
          },
        },
      },
      majorDraw: {
        totalEntries,
        activeDraws: activeDrawsCount,
      },
      conversionRate,
      ...(conversionRateTrend && { conversionRateTrend }),
      facebookAds: {
        spend: facebookAdsSpend,
        ...(adSpendTrend && { spendTrend: adSpendTrend }),
        roas: facebookAdsRoas,
        ...(roasTrend && { roasTrend }),
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
