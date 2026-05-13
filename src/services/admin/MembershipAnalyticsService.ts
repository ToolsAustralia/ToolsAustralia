import { formatInTimeZone } from "date-fns-tz";
import User from "@/models/User";
import MembershipDailySnapshot, { type IMembershipDailySnapshot } from "@/models/MembershipDailySnapshot";
import MembershipRenewalCycle from "@/models/MembershipRenewalCycle";
import MembershipStatusHistory from "@/models/MembershipStatusHistory";
import { getPackageById } from "@/data/membershipPackages";
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  getActiveSubscriptionFilter,
  SUBSCRIBED_SUBSCRIPTION_STATUSES,
} from "@/utils/admin/userFilterBuilder";
import type { AdminDashboardDateRangeKey, MembershipAsOfMode } from "@/utils/admin/dashboardDateRange";
import { fetchNetBenefitsGrantedInRange } from "@/utils/payment/payment-event-net-queries";
import type { MembershipAnalyticsBundle } from "@/types/admin/membershipAnalytics";

export const SUBSCRIPTION_PACKAGE_IDS = ["tradie-subscription", "foreman-subscription", "boss-subscription"] as const;

export interface MembershipByPackageItemDTO {
  packageId: string;
  packageName: string;
  activeCount: number;
  cancelledCount: number;
  pastDueCount: number;
  activeRevenue: number;
  pastDueRevenue: number;
}

export interface MembershipByPackageSummaryDTO {
  totalActiveCount: number;
  totalPastDueCount: number;
  totalActiveRevenue: number;
  totalPastDueRevenue: number;
  /** Legacy field — kept for compatibility with the deprecated per-user snapshot reader. */
  snapshotPartial?: boolean;
  /** Set when caller asked for a snapshot date but no snapshot row existed; live data returned instead. */
  snapshotMissing?: boolean;
}

export interface MembershipByPackageDataDTO {
  packages: MembershipByPackageItemDTO[];
  summary: MembershipByPackageSummaryDTO;
}

/**
 * Membership renewal, past-due, and cancellation metrics for admin dashboard.
 */
export class MembershipAnalyticsService {
  async getAnalyticsBundle(
    startDate: Date,
    endDate: Date,
    dateRange: AdminDashboardDateRangeKey,
    options?: {
      membershipAsOfMode?: MembershipAsOfMode;
      asOfDate?: Date | null;
      // When provided, skips the all-range BenefitsGranted scan and uses the
      // membershipRenewal bucket already computed by DashboardStatsSnapshotReader.
      // purchaseCount → successfulRenewalsInRange (additive across snapshot days).
      // userCount     → successfulRenewalUserCount (distinct users, refund-aware,
      //                 always computed live by the reader).
      precomputedRenewals?: { purchaseCount: number; userCount: number };
    }
  ): Promise<MembershipAnalyticsBundle> {
    void options?.membershipAsOfMode;
    void options?.asOfDate;
    const precomputedRenewals = options?.precomputedRenewals;

    const [expectedRenewalsInRange, failedRenewalInvoicesInRange, becamePastDueIds] = await Promise.all([
      MembershipRenewalCycle.countDocuments({
        billingReason: "subscription_cycle",
        dueAt: { $gte: startDate, $lte: endDate },
      }),
      MembershipRenewalCycle.countDocuments({
        billingReason: "subscription_cycle",
        status: "failed",
        failedAt: { $gte: startDate, $lte: endDate },
      }),
        MembershipStatusHistory.distinct("userId", {
          membershipStatus: "past_due",
          effectiveAt: { $gte: startDate, $lte: endDate },
          source: { $in: ["webhook_invoice_payment_failed", "backfill_user_pastDueAt"] },
        }),
    ]);

    const scheduledCancellationQuery =
      dateRange === "all-time"
        ? {
            "subscription.endDate": { $exists: true, $ne: null },
            "subscription.autoRenew": false,
            "subscription.status": { $in: [...SUBSCRIBED_SUBSCRIPTION_STATUSES] },
            isActive: true,
          }
        : null;

    // Delta query: users who cancelled within the date range (live, never from snapshot)
    const cancellationRows = scheduledCancellationQuery
      ? await User.find(scheduledCancellationQuery).select("subscription.packageId").lean()
      : await User.find({
          isActive: true,
          "subscription.cancelledAt": { $gte: startDate, $lte: endDate },
        })
          .select("subscription.packageId")
          .lean();

    let successfulRenewalsInRange = 0;
    let successfulRenewalUserCount = 0;
    if (precomputedRenewals) {
      successfulRenewalsInRange = precomputedRenewals.purchaseCount;
      successfulRenewalUserCount = precomputedRenewals.userCount;
    } else {
      const successfulEvents = await fetchNetBenefitsGrantedInRange(startDate, endDate, {
        userId: 1,
        packageType: 1,
        data: 1,
      });
      const renewalUserIds = new Set<string>();
      for (const ev of successfulEvents) {
        if (ev.packageType === "membership" && ev.data?.billingReason === "subscription_cycle") {
          successfulRenewalsInRange += 1;
          const uid = ev.userId?.toString();
          if (uid) renewalUserIds.add(uid);
        }
      }
      successfulRenewalUserCount = renewalUserIds.size;
    }

    // Revenue impact is derived from cancellationRows so it always matches the
    // cohort behind cancellationsInRange:
    //  - all-time → standing scheduled-cancel users (autoRenew=false + endDate set)
    //  - any other range → users whose subscription.cancelledAt falls in the range
    // Do NOT source this from the daily snapshot: snapshot.cancelledCount is the
    // standing scheduled-cancel STOCK as of that day, which would mismatch the
    // delta count shown alongside it on the dashboard.
    let cancelledMembershipRevenueImpact = 0;
    for (const u of cancellationRows) {
      const pid = u.subscription?.packageId;
      const id = typeof pid === "string" ? pid : pid != null && typeof pid === "object" && "toString" in pid ? String(pid) : "";
      const pkg = id ? getPackageById(id) : undefined;
      cancelledMembershipRevenueImpact += pkg?.price ?? 0;
    }
    cancelledMembershipRevenueImpact = Math.round(cancelledMembershipRevenueImpact * 100) / 100;

    return {
      expectedRenewalsInRange,
      successfulRenewalsInRange,
      successfulRenewalUserCount,
      failedRenewalInvoicesInRange,
      becamePastDueInRange: becamePastDueIds.length,
      cancellationsInRange: cancellationRows.length,
      cancelledMembershipRevenueImpact,
    };
  }

  /**
   * Current membership counts (live) — same semantics as legacy membership-by-package route.
   */
  async getMembershipByPackageLive(): Promise<MembershipByPackageDataDTO> {
    const baseMatch = {
      "subscription.packageId": { $in: [...SUBSCRIPTION_PACKAGE_IDS] },
      isActive: true,
    };

    const [activeResults, cancelledResults, pastDueResults] = await Promise.all([
      User.aggregate([
        { $match: { ...baseMatch, ...getActiveSubscriptionFilter(false) } },
        { $group: { _id: "$subscription.packageId", count: { $sum: 1 } } },
      ]),
      User.aggregate([
        {
          $match: {
            ...baseMatch,
            "subscription.status": { $in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
            "subscription.autoRenew": false,
            "subscription.endDate": { $exists: true, $ne: null },
          },
        },
        { $group: { _id: "$subscription.packageId", count: { $sum: 1 } } },
      ]),
      User.aggregate([
        {
          $match: {
            ...baseMatch,
            "subscription.status": "past_due",
            "subscription.packageId": { $exists: true, $nin: [null, ""] },
          },
        },
        { $group: { _id: "$subscription.packageId", count: { $sum: 1 } } },
      ]),
    ]);

    const activeByPackage = Object.fromEntries(activeResults.map((r) => [String(r._id), r.count]));
    const cancelledByPackage = Object.fromEntries(cancelledResults.map((r) => [String(r._id), r.count]));
    const pastDueByPackage = Object.fromEntries(pastDueResults.map((r) => [String(r._id), r.count]));

    let totalActiveCount = 0;
    let totalPastDueCount = 0;
    let totalActiveRevenue = 0;
    let totalPastDueRevenue = 0;

    const packages: MembershipByPackageItemDTO[] = SUBSCRIPTION_PACKAGE_IDS.map((packageId) => {
      const pkg = getPackageById(packageId);
      const price = pkg?.price ?? 0;
      const activeCount = activeByPackage[packageId] ?? 0;
      const pastDueCount = pastDueByPackage[packageId] ?? 0;
      const activeRevenue = Math.round(activeCount * price * 100) / 100;
      const pastDueRevenue = Math.round(pastDueCount * price * 100) / 100;
      totalActiveCount += activeCount;
      totalPastDueCount += pastDueCount;
      totalActiveRevenue += activeRevenue;
      totalPastDueRevenue += pastDueRevenue;
      return {
        packageId,
        packageName: pkg?.name ?? packageId,
        activeCount,
        cancelledCount: cancelledByPackage[packageId] ?? 0,
        pastDueCount,
        activeRevenue,
        pastDueRevenue,
      };
    });

    return {
      packages,
      summary: {
        totalActiveCount,
        totalPastDueCount,
        totalActiveRevenue: Math.round(totalActiveRevenue * 100) / 100,
        totalPastDueRevenue: Math.round(totalPastDueRevenue * 100) / 100,
      },
    };
  }

  /**
   * Returns the four counts the snapshot model needs (including fully-cancelled).
   * Used by the cron writer; not exposed to dashboard read paths.
   */
  async getMembershipByPackageLiveForSnapshot(): Promise<{
    packages: Array<{
      packageId: string;
      activeCount: number;
      pastDueCount: number;
      scheduledCancelCount: number;
      fullyCancelledCount: number;
    }>;
  }> {
    const baseMatch = {
      "subscription.packageId": { $in: [...SUBSCRIPTION_PACKAGE_IDS] },
    };
    const now = new Date();

    const [activeResults, scheduledResults, pastDueResults, fullyCancelledResults] = await Promise.all([
      User.aggregate([
        { $match: { ...baseMatch, isActive: true, ...getActiveSubscriptionFilter(false) } },
        { $group: { _id: "$subscription.packageId", count: { $sum: 1 } } },
      ]),
      User.aggregate([
        {
          $match: {
            ...baseMatch,
            isActive: true,
            "subscription.status": { $in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
            "subscription.autoRenew": false,
            "subscription.endDate": { $exists: true, $ne: null },
          },
        },
        { $group: { _id: "$subscription.packageId", count: { $sum: 1 } } },
      ]),
      User.aggregate([
        {
          $match: {
            ...baseMatch,
            isActive: true,
            "subscription.status": "past_due",
            "subscription.packageId": { $exists: true, $nin: [null, ""] },
          },
        },
        { $group: { _id: "$subscription.packageId", count: { $sum: 1 } } },
      ]),
      User.aggregate([
        {
          $match: {
            ...baseMatch,
            $or: [
              { "subscription.status": { $in: ["canceled", "cancelled"] } },
              {
                "subscription.endDate": { $lte: now, $ne: null },
                "subscription.cancelledAt": { $ne: null },
              },
            ],
          },
        },
        { $group: { _id: "$subscription.packageId", count: { $sum: 1 } } },
      ]),
    ]);

    const toMap = (rows: Array<{ _id: string; count: number }>) =>
      Object.fromEntries(rows.map((r) => [String(r._id), r.count]));

    const a = toMap(activeResults);
    const s = toMap(scheduledResults);
    const p = toMap(pastDueResults);
    const c = toMap(fullyCancelledResults);

    return {
      packages: SUBSCRIPTION_PACKAGE_IDS.map((packageId) => ({
        packageId,
        activeCount: a[packageId] ?? 0,
        pastDueCount: p[packageId] ?? 0,
        scheduledCancelCount: s[packageId] ?? 0,
        fullyCancelledCount: c[packageId] ?? 0,
      })),
    };
  }

  /**
   * Point-in-time membership counts read from MembershipDailySnapshot, with live fallback when no row exists.
   */
  async getMembershipByPackageSnapshot(asOfDate: Date): Promise<MembershipByPackageDataDTO> {
    const dateKey = formatInTimeZone(asOfDate, "Australia/Sydney", "yyyy-MM-dd");
    const rows = await MembershipDailySnapshot.find({ date: dateKey }).lean();

    if (rows.length === 0) {
      const live = await this.getMembershipByPackageLive();
      return {
        ...live,
        summary: { ...live.summary, snapshotMissing: true },
      };
    }

    const byPackage = new Map<string, IMembershipDailySnapshot>();
    for (const r of rows) byPackage.set(r.packageId, r as IMembershipDailySnapshot);

    let totalActiveCount = 0;
    let totalPastDueCount = 0;
    let totalActiveRevenue = 0;
    let totalPastDueRevenue = 0;

    const packages: MembershipByPackageItemDTO[] = SUBSCRIPTION_PACKAGE_IDS.map((packageId) => {
      const row = byPackage.get(packageId);
      const activeCount = row?.activeCount ?? 0;
      const pastDueCount = row?.pastDueCount ?? 0;
      const cancelledCount = row?.scheduledCancelCount ?? 0; // dashboard's "cancelled" = scheduled
      const activeRevenue = row?.activeRevenue ?? 0;
      const pastDueRevenue = row?.pastDueRevenue ?? 0;

      totalActiveCount += activeCount;
      totalPastDueCount += pastDueCount;
      totalActiveRevenue += activeRevenue;
      totalPastDueRevenue += pastDueRevenue;

      return {
        packageId,
        packageName: getPackageById(packageId)?.name ?? packageId,
        activeCount,
        cancelledCount,
        pastDueCount,
        activeRevenue,
        pastDueRevenue,
      };
    });

    return {
      packages,
      summary: {
        totalActiveCount,
        totalPastDueCount,
        totalActiveRevenue: Math.round(totalActiveRevenue * 100) / 100,
        totalPastDueRevenue: Math.round(totalPastDueRevenue * 100) / 100,
      },
    };
  }
}
