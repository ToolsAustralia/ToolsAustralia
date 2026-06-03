import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import MajorDraw from "@/models/MajorDraw";
import { readStatsForRange } from "@/services/admin/dashboard-stats/DashboardStatsSnapshotReader";
import { DashboardMetricsService } from "@/services/admin/DashboardMetricsService";
import { MembershipAnalyticsService } from "@/services/admin/MembershipAnalyticsService";
import { parseAdminDashboardDateRange } from "@/utils/admin/dashboardDateRange";
import {
  getActiveSubscriptionFilter,
  getEverPaidUserFilter,
  SUBSCRIBED_SUBSCRIPTION_STATUSES,
} from "@/utils/admin/userFilterBuilder";
import { trendCalculationService } from "@/services/admin/TrendCalculationService";
import { PLATFORM_TO_AD_CHANNEL_KEY } from "@/services/admin/dashboard-stats/snapshotSchema";
import { ATTRIBUTED_PLATFORM_KEYS } from "@/models/DashboardStatsDailySnapshot";
import type { TrendData } from "@/types/admin/trend-types";

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
    const guard = await requirePermission("overview.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    const parsedRange = parseAdminDashboardDateRange({
      dateRange: searchParams.get("dateRange"),
      startDateParam,
      endDateParam,
    });
    if (!parsedRange.ok) {
      return NextResponse.json({ error: parsedRange.error }, { status: parsedRange.status });
    }

    const { startDate, endDate, dateRange, membershipAsOfMode, asOfDate } = parsedRange.value;

    console.log("📊 Fetching admin dashboard stats...", { dateRange });

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
            "subscription.status": { $in: [...SUBSCRIBED_SUBSCRIPTION_STATUSES] },
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
      "subscription.status": { $in: [...SUBSCRIBED_SUBSCRIPTION_STATUSES] },
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

    // When the dashboard is in snapshot mode (asOfDate is in the past), override the
    // *standing* cancellation metrics with the corresponding values from the daily
    // snapshot. The *delta* values (cancelledMemberships, range counters) stay live.
    let standingScheduledCancellation = totalScheduledCancellation;
    let snapshotMissingForStanding = false;
    if (membershipAsOfMode === "snapshot" && asOfDate) {
      const snapshot = await new MembershipAnalyticsService().getMembershipByPackageSnapshot(asOfDate);
      if (snapshot.summary?.snapshotMissing) {
        snapshotMissingForStanding = true;
      } else {
        standingScheduledCancellation = snapshot.packages.reduce(
          (sum, p) => sum + (p.cancelledCount ?? 0),
          0
        );
      }
    }

    // Drop-off rate: % of membership base (active + scheduled) that has scheduled cancellation
    const membershipBase = activeSubscriptions + standingScheduledCancellation;
    const dropOffRate =
      membershipBase > 0
        ? Math.round((standingScheduledCancellation / membershipBase) * 1000) / 10
        : 0;

    // Period churn rate: % of active subscribers who cancelled in the selected period (only when not all-time)
    const periodChurnRate =
      dateRange !== "all-time" && activeSubscriptions > 0
        ? Math.round((cancelledMemberships / activeSubscriptions) * 10000) / 100
        : undefined;

    // Calculate profile completion rate
    const profileCompletionRate = totalUsers > 0 ? Math.round((usersWithCompletedProfiles / totalUsers) * 100) : 0;

    // ========================================
    // REVENUE + AD CHANNELS (from snapshot reader)
    // ========================================
    const snapshotRead = await readStatsForRange({
      rangeStartUTC: startDate,
      rangeEndUTC: endDate,
    });

    const totalRevenue = snapshotRead.revenue.total;
    const membershipPurchaseData = {
      revenue: snapshotRead.revenue.buckets.membershipPurchase.revenue,
      purchaseCount: snapshotRead.revenue.buckets.membershipPurchase.purchaseCount,
      userCount: snapshotRead.revenue.buckets.membershipPurchase.userCount,
    };
    const membershipRenewalData = {
      revenue: snapshotRead.revenue.buckets.membershipRenewal.revenue,
      purchaseCount: snapshotRead.revenue.buckets.membershipRenewal.purchaseCount,
      userCount: snapshotRead.revenue.buckets.membershipRenewal.userCount,
    };
    const oneTimePurchaseData = {
      revenue: snapshotRead.revenue.buckets.oneTimePurchase.revenue,
      purchaseCount: snapshotRead.revenue.buckets.oneTimePurchase.purchaseCount,
      userCount: snapshotRead.revenue.buckets.oneTimePurchase.userCount,
    };
    const additionalOneTimePurchaseData = {
      revenue: snapshotRead.revenue.buckets.additionalOneTimePurchase.revenue,
      purchaseCount: snapshotRead.revenue.buckets.additionalOneTimePurchase.purchaseCount,
      userCount: snapshotRead.revenue.buckets.additionalOneTimePurchase.userCount,
    };
    const miniDrawData = {
      revenue: snapshotRead.revenue.buckets.miniDraw.revenue,
      purchaseCount: snapshotRead.revenue.buckets.miniDraw.purchaseCount,
      userCount: snapshotRead.revenue.buckets.miniDraw.userCount,
    };
    const upsellData = {
      revenue: snapshotRead.revenue.buckets.upsell.revenue,
      purchaseCount: snapshotRead.revenue.buckets.upsell.purchaseCount,
      userCount: snapshotRead.revenue.buckets.upsell.userCount,
    };

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
    // FACEBOOK ADS (from snapshot reader)
    // ========================================
    const facebookAdsSpend = snapshotRead.adChannels.facebook?.spend ?? 0;
    const facebookAdsRoas = snapshotRead.adChannels.facebook?.roas ?? 0;

    // ========================================
    // ATTRIBUTED REVENUE PER PLATFORM
    // ========================================
    const attributedRevenue: Record<string, {
      revenue: number;
      renewalRevenue: number;
      conversions: number;
      byConfidence: { click: number; utm_only: number; inferred_backfill: number };
      adSpend?: number;
      trueRoas?: number;
      revenueTrend?: TrendData;
      trueRoasTrend?: TrendData;
    }> = {};
    for (const p of ATTRIBUTED_PLATFORM_KEYS) {
      const ar = snapshotRead.attributedRevenue[p];
      if (!ar || (ar.newRevenue === 0 && ar.conversions === 0 && ar.renewalRevenue === 0)) continue;
      const adKey = PLATFORM_TO_AD_CHANNEL_KEY[p];
      const spend = adKey ? (snapshotRead.adChannels[adKey]?.spend ?? 0) : 0;
      const entry: (typeof attributedRevenue)[string] = {
        revenue: ar.newRevenue,          // acquisition revenue only — the ads-ROAS numerator
        renewalRevenue: ar.renewalRevenue,
        conversions: ar.conversions,
        byConfidence: ar.byConfidence,
      };
      if (adKey && spend > 0) {
        entry.adSpend = spend;
        entry.trueRoas = ar.newRevenue / spend;  // ROAS uses acquisition revenue only
      }
      attributedRevenue[p] = entry;
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
        "subscription.status": { $in: [...SUBSCRIBED_SUBSCRIPTION_STATUSES] },
        isActive: true,
      };

      const [
        previousTotalUsers,
        previousNewSignupsInRange,
        previousCancelledMemberships,
        previousTotalScheduledCancellation,
        previousSnapshotRead,
      ] = await Promise.all([
        User.countDocuments({ isActive: true, createdAt: { $lte: comparisonEndDate } }),
        User.countDocuments({
          createdAt: { $gte: comparisonStartDate, $lte: comparisonEndDate },
          isActive: true,
        }),
        User.countDocuments(cancelledMembershipsComparisonQuery),
        User.countDocuments(previousTotalScheduledCancellationQuery),
        readStatsForRange({
          rangeStartUTC: comparisonStartDate,
          rangeEndUTC: comparisonEndDate,
        }),
      ]);

      const previousTotalRevenue = previousSnapshotRead.revenue.total;
      const previousMembershipPurchaseData = {
        revenue: previousSnapshotRead.revenue.buckets.membershipPurchase.revenue,
      };
      const previousMembershipRenewalData = {
        revenue: previousSnapshotRead.revenue.buckets.membershipRenewal.revenue,
      };
      const previousOneTimePurchaseData = {
        revenue: previousSnapshotRead.revenue.buckets.oneTimePurchase.revenue,
      };
      const previousAdditionalOneTimePurchaseData = {
        revenue: previousSnapshotRead.revenue.buckets.additionalOneTimePurchase.revenue,
      };
      const previousMiniDrawData = {
        revenue: previousSnapshotRead.revenue.buckets.miniDraw.revenue,
      };
      const previousUpsellData = {
        revenue: previousSnapshotRead.revenue.buckets.upsell.revenue,
      };

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

      const previousFacebookAdsSpend = previousSnapshotRead.adChannels.facebook?.spend ?? 0;
      const previousFacebookAdsRoas = previousSnapshotRead.adChannels.facebook?.roas ?? 0;

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

      for (const p of Object.keys(attributedRevenue)) {
        const prevAr = previousSnapshotRead.attributedRevenue?.[p as keyof typeof previousSnapshotRead.attributedRevenue];
        if (prevAr) {
          attributedRevenue[p].revenueTrend = trendCalculationService.calculateTrend(
            attributedRevenue[p].revenue,
            prevAr.newRevenue
          );
          const adKey = PLATFORM_TO_AD_CHANNEL_KEY[p as keyof typeof PLATFORM_TO_AD_CHANNEL_KEY];
          const prevSpend = adKey ? (previousSnapshotRead.adChannels[adKey]?.spend ?? 0) : 0;
          if (attributedRevenue[p].trueRoas != null && prevSpend > 0) {
            attributedRevenue[p].trueRoasTrend = trendCalculationService.calculateTrend(
              attributedRevenue[p].trueRoas!,
              prevAr.newRevenue / prevSpend
            );
          }
        }
      }
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

    const membershipAnalyticsService = new MembershipAnalyticsService();
    let membershipAnalytics;
    try {
      membershipAnalytics = await membershipAnalyticsService.getAnalyticsBundle(startDate, endDate, dateRange, {
        membershipAsOfMode,
        asOfDate,
        precomputedRenewals: {
          purchaseCount: membershipRenewalData.purchaseCount,
          userCount: membershipRenewalData.userCount,
        },
      });
    } catch (maErr) {
      console.error("⚠️ Error fetching membership analytics bundle:", maErr);
      membershipAnalytics = {
        expectedRenewalsInRange: 0,
        successfulRenewalsInRange: 0,
        successfulRenewalUserCount: 0,
        failedRenewalInvoicesInRange: 0,
        becamePastDueInRange: 0,
        cancellationsInRange: 0,
        cancelledMembershipRevenueImpact: 0,
      };
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
        totalScheduledCancellation: standingScheduledCancellation,
        dropOffRate,
        ...(periodChurnRate != null && { periodChurnRate }),
        ...(dropOffRateTrend && { dropOffRateTrend }),
        membershipRenewals: {
          expectedInRange: membershipAnalytics.expectedRenewalsInRange,
          succeededInRange: membershipAnalytics.successfulRenewalsInRange,
          succeededDistinctMembers: membershipAnalytics.successfulRenewalUserCount,
          failedInvoicesInRange: membershipAnalytics.failedRenewalInvoicesInRange,
          becamePastDueInRange: membershipAnalytics.becamePastDueInRange,
        },
        cancellationImpact: {
          estimatedMonthlyRevenue: membershipAnalytics.cancelledMembershipRevenueImpact,
        },
        ...(membershipAnalytics.renewalProgress && {
          renewalProgress: membershipAnalytics.renewalProgress,
        }),
        ...(snapshotMissingForStanding && { snapshotMissingForStanding: true }),
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
            userCount: membershipPurchaseData.userCount,
            ...(revenueBreakdownTrends.membershipPurchase && {
              trend: revenueBreakdownTrends.membershipPurchase,
            }),
          },
          membershipRenewal: {
            revenue: membershipRenewalData.revenue,
            purchaseCount: membershipRenewalData.purchaseCount,
            userCount: membershipRenewalData.userCount,
            ...(revenueBreakdownTrends.membershipRenewal && {
              trend: revenueBreakdownTrends.membershipRenewal,
            }),
          },
          oneTimePurchase: {
            revenue: oneTimePurchaseData.revenue,
            purchaseCount: oneTimePurchaseData.purchaseCount,
            userCount: oneTimePurchaseData.userCount,
            ...(revenueBreakdownTrends.oneTimePurchase && {
              trend: revenueBreakdownTrends.oneTimePurchase,
            }),
          },
          additionalOneTimePurchase: {
            revenue: additionalOneTimePurchaseData.revenue,
            purchaseCount: additionalOneTimePurchaseData.purchaseCount,
            userCount: additionalOneTimePurchaseData.userCount,
            ...(revenueBreakdownTrends.additionalOneTimePurchase && {
              trend: revenueBreakdownTrends.additionalOneTimePurchase,
            }),
          },
          miniDraw: {
            revenue: miniDrawData.revenue,
            purchaseCount: miniDrawData.purchaseCount,
            userCount: miniDrawData.userCount,
            ...(revenueBreakdownTrends.miniDraw && { trend: revenueBreakdownTrends.miniDraw }),
          },
          upsell: {
            revenue: upsellData.revenue,
            purchaseCount: upsellData.purchaseCount,
            userCount: upsellData.userCount,
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
      attributedRevenue,
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
