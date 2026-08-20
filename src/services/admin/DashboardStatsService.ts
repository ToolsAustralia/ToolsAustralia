import User from "@/models/User";
import MajorDraw from "@/models/MajorDraw";
import { readStatsForRange } from "@/services/admin/dashboard-stats/DashboardStatsSnapshotReader";
import { DashboardMetricsService } from "@/services/admin/DashboardMetricsService";
import { MembershipAnalyticsService } from "@/services/admin/MembershipAnalyticsService";
import {
  parseAdminDashboardDateRange,
  type AdminDashboardDateRangeKey,
} from "@/utils/admin/dashboardDateRange";
import {
  getActiveSubscriptionFilter,
  getEverPaidUserFilter,
  SUBSCRIBED_SUBSCRIPTION_STATUSES,
} from "@/utils/admin/userFilterBuilder";
import { trendCalculationService } from "@/services/admin/TrendCalculationService";
import { PLATFORM_TO_AD_CHANNEL_KEY } from "@/services/admin/dashboard-stats/snapshotSchema";
import { getSignupsByPlatform } from "@/services/admin/signupsByPlatform";
import { ATTRIBUTED_PLATFORM_KEYS } from "@/models/DashboardStatsDailySnapshot";
import type { TrendData } from "@/types/admin/trend-types";

export interface DashboardStatsInput {
  dateRange: AdminDashboardDateRangeKey;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * Bad-input error thrown by {@link DashboardStatsService.getStats} when the
 * date-range parse fails. Carries the original HTTP status the legacy route
 * would have returned so adapters can map it back to a 4xx response.
 */
export class DashboardStatsInputError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "DashboardStatsInputError";
    this.status = status;
  }
}

/**
 * Computes the canonical admin dashboard stats payload.
 *
 * Pure orchestration extracted from `src/app/api/admin/dashboard/stats/route.ts`.
 * No NextRequest/NextResponse coupling — callable from the admin route handler
 * and from internal callers (e.g. Norm) alike.
 *
 * The caller is responsible for:
 *   - Authorization (`overview.view` permission).
 *   - Opening the Mongo connection (`connectDB()`).
 *   - Wrapping the returned `stats` object in whatever response shape is
 *     appropriate (`{ success, data }` for the admin route, etc.).
 */
export class DashboardStatsService {
  async getStats(input: DashboardStatsInput) {
    const parsedRange = parseAdminDashboardDateRange({
      dateRange: input.dateRange,
      startDateParam: input.startDate ?? null,
      endDateParam: input.endDate ?? null,
    });
    if (!parsedRange.ok) {
      throw new DashboardStatsInputError(parsedRange.error, parsedRange.status);
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

    // Signups per acquisition platform for the same window — feeds the Advertising
    // card's per-platform signup count. Same date basis as `newSignupsInRange` above,
    // so the per-platform figures sum to it.
    const signupsByPlatform = await getSignupsByPlatform(startDate, endDate);

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
    // Merchandise. Its own bucket since snapshot source version 4 — before that,
    // shop money existed nowhere in this pipeline at all.
    const shopData = {
      revenue: snapshotRead.revenue.buckets.shop.revenue,
      purchaseCount: snapshotRead.revenue.buckets.shop.purchaseCount,
      userCount: snapshotRead.revenue.buckets.shop.userCount,
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
    // ALL AD PLATFORMS COMBINED (2026-07-29)
    // ========================================
    // The headline Ad Spend / ROAS KPIs used to read `facebookAds` alone, which was
    // accurate while Meta was the only channel with a spend feed. TikTok's spend sync is
    // live, so a Meta-only headline now UNDERSTATES what the business actually spent.
    //
    // This is deliberately a NEW field rather than a redefinition of `facebookAds`:
    // that key is also read by the Norm gateway (/v1/dashboard/stats), and silently
    // changing its meaning would drift Norm's numbers with no schema change to notice
    // (CLAUDE.md rule 10). `facebookAds` stays Meta-only and truthful to its name.
    //
    // ROAS keeps its existing SEMANTIC — platform-reported revenue ÷ spend — and only
    // widens its SCOPE to every channel. The server-attributed alternative is already
    // surfaced separately as the Advertising card's "Blended ROAS" and its per-platform
    // "ROAS · server" column; conflating the two here would silently change a number the
    // team reads daily.
    const sumAdChannels = (channels: Record<string, { spend: number; revenue: number }>) => {
      let spend = 0;
      let revenue = 0;
      for (const c of Object.values(channels)) {
        spend += Number.isFinite(c?.spend) ? c.spend : 0;
        revenue += Number.isFinite(c?.revenue) ? c.revenue : 0;
      }
      return { spend, revenue, roas: spend > 0 ? revenue / spend : 0 };
    };
    const adTotalsCurrent = sumAdChannels(snapshotRead.adChannels);

    // ========================================
    // ATTRIBUTED REVENUE PER PLATFORM
    // ========================================
    const attributedRevenue: Record<string, {
      revenue: number;
      renewalRevenue: number;
      conversions: number;
      signups?: number;
      byConfidence: { click: number; utm_only: number; inferred_backfill: number };
      adSpend?: number;
      trueRoas?: number;
      platformRevenue?: number;
      platformRoas?: number;
      revenueTrend?: TrendData;
      trueRoasTrend?: TrendData;
    }> = {};
    for (const p of ATTRIBUTED_PLATFORM_KEYS) {
      const ar = snapshotRead.attributedRevenue[p];
      const signupsForPlatform = signupsByPlatform.byPlatform[p] ?? 0;
      const adKey = PLATFORM_TO_AD_CHANNEL_KEY[p];
      const channel = adKey ? snapshotRead.adChannels[adKey] : undefined;
      const spend = channel?.spend ?? 0;
      // Skip ONLY a platform with nothing at all to say. Note `spend > 0` is part of the
      // test: a channel that SPENT MONEY AND RETURNED NOTHING is the single most important
      // row on this card, and it used to be dropped here — the headline Ad Spend KPI counted
      // it (that sums adChannels directly) while the per-platform table silently omitted it,
      // so the two disagreed and the loss was invisible. Signups likewise keep a row alive:
      // a channel creating accounts that haven't converted is exactly what that column is for.
      const hasAttribution =
        !!ar && (ar.newRevenue !== 0 || ar.conversions !== 0 || ar.renewalRevenue !== 0);
      if (!hasAttribution && signupsForPlatform === 0 && spend <= 0) {
        continue;
      }
      const entry: (typeof attributedRevenue)[string] = {
        revenue: ar?.newRevenue ?? 0,     // acquisition revenue only — the ads-ROAS numerator
        renewalRevenue: ar?.renewalRevenue ?? 0,
        conversions: ar?.conversions ?? 0,
        signups: signupsForPlatform,
        byConfidence: ar?.byConfidence ?? { click: 0, utm_only: 0, inferred_backfill: 0 },
      };
      if (adKey && spend > 0) {
        entry.adSpend = spend;
        // SERVER ROAS ("true" ROAS) — our own payment-attributed acquisition revenue ÷ spend.
        entry.trueRoas = ar ? ar.newRevenue / spend : 0;
        // PLATFORM ROAS — the ad platform's OWN reported conversion value ÷ the same spend.
        // Already captured per channel by each AdChannelProvider (Meta from its API, TikTok
        // summed from TikTokAdInsightsDaily); it was being discarded here. The two ROAS
        // figures disagree by design — different attribution models, windows, and
        // de-duplication — and seeing the gap is the point.
        if (channel && channel.revenue > 0) {
          entry.platformRevenue = channel.revenue;
          entry.platformRoas = channel.roas > 0 ? channel.roas : channel.revenue / spend;
        }
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

      // Trends must compare like with like — an all-platform current value against a
      // Meta-only previous value would read as a huge spend "increase" the day TikTok's
      // sync went live, when nothing about the spending actually changed.
      const previousAdTotals = sumAdChannels(previousSnapshotRead.adChannels);

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
      // The KPI cards render all-platform figures, so their trends compare all-platform
      // periods. (`facebookAds` keeps its own Meta-only values below for Norm.)
      adSpendTrend = trendCalculationService.calculateTrend(
        adTotalsCurrent.spend,
        previousAdTotals.spend
      );
      roasTrend = trendCalculationService.calculateTrend(adTotalsCurrent.roas, previousAdTotals.roas);

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
          shop: {
            revenue: shopData.revenue,
            purchaseCount: shopData.purchaseCount,
            userCount: shopData.userCount,
          },
        },
      },
      majorDraw: {
        totalEntries,
        activeDraws: activeDrawsCount,
      },
      conversionRate,
      ...(conversionRateTrend && { conversionRateTrend }),
      // Meta-only, unchanged — the Norm gateway reads this and its name must stay true.
      facebookAds: {
        spend: facebookAdsSpend,
        roas: facebookAdsRoas,
      },
      // Every ad platform with a spend feed, combined (Meta + TikTok today). This is what
      // the headline Ad Spend / ROAS KPIs render — see the note where it's computed.
      adTotals: {
        spend: adTotalsCurrent.spend,
        revenue: adTotalsCurrent.revenue,
        roas: adTotalsCurrent.roas,
        ...(adSpendTrend && { spendTrend: adSpendTrend }),
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

    return stats;
  }
}
