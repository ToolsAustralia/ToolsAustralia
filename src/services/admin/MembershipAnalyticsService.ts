import User from "@/models/User";
import MembershipRenewalCycle from "@/models/MembershipRenewalCycle";
import MembershipStatusHistory from "@/models/MembershipStatusHistory";
import { getPackageById } from "@/data/membershipPackages";
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  getActiveSubscriptionFilter,
  SUBSCRIBED_SUBSCRIPTION_STATUSES,
} from "@/utils/admin/userFilterBuilder";
import type { AdminDashboardDateRangeKey } from "@/utils/admin/dashboardDateRange";
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
  /** True when some users had no status history and fell back to current subscription fields */
  snapshotPartial?: boolean;
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
    dateRange: AdminDashboardDateRangeKey
  ): Promise<MembershipAnalyticsBundle> {
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

    const cancellationRows = scheduledCancellationQuery
      ? await User.find(scheduledCancellationQuery).select("subscription.packageId").lean()
      : await User.find({
          isActive: true,
          "subscription.cancelledAt": { $gte: startDate, $lte: endDate },
        })
          .select("subscription.packageId")
          .lean();

    const successfulEvents = await fetchNetBenefitsGrantedInRange(startDate, endDate, {
      userId: 1,
      packageType: 1,
      data: 1,
    });

    let successfulRenewalsInRange = 0;
    const renewalUserIds = new Set<string>();
    for (const ev of successfulEvents) {
      if (ev.packageType === "membership" && ev.data?.billingReason === "subscription_cycle") {
        successfulRenewalsInRange += 1;
        const uid = ev.userId?.toString();
        if (uid) renewalUserIds.add(uid);
      }
    }

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
      successfulRenewalUserCount: renewalUserIds.size,
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
   * Point-in-time membership counts using MembershipStatusHistory, with fallback to current User.subscription.
   */
  async getMembershipByPackageSnapshot(asOfDate: Date): Promise<MembershipByPackageDataDTO> {
    const baseMatch = {
      "subscription.packageId": { $in: [...SUBSCRIPTION_PACKAGE_IDS] },
      isActive: true,
    };

    const grouped = await User.aggregate<{
      _id: string;
      activeCount: number;
      cancelledCount: number;
      pastDueCount: number;
      partialCount: number;
    }>([
      { $match: baseMatch },
      {
        $lookup: {
          from: "membershipstatushistories",
          let: { uid: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ["$userId", "$$uid"] }, { $lte: ["$effectiveAt", asOfDate] }],
                },
              },
            },
            { $sort: { effectiveAt: -1 } },
            { $limit: 1 },
          ],
          as: "hist",
        },
      },
      {
        $addFields: {
          snapshotStatus: {
            $cond: {
              if: { $gt: [{ $size: "$hist" }, 0] },
              then: { $arrayElemAt: ["$hist.membershipStatus", 0] },
              else: {
                $switch: {
                  branches: [
                    { case: { $eq: ["$subscription.status", "past_due"] }, then: "past_due" },
                    { case: { $eq: ["$subscription.status", "unpaid"] }, then: "unpaid" },
                    { case: { $eq: ["$subscription.status", "canceled"] }, then: "canceled" },
                    { case: { $eq: ["$subscription.status", "cancelled"] }, then: "canceled" },
                    { case: { $eq: ["$subscription.status", "active"] }, then: "active" },
                    { case: { $eq: ["$subscription.status", "trialing"] }, then: "trialing" },
                  ],
                  default: "none",
                },
              },
            },
          },
          snapshotPartial: { $eq: [{ $size: "$hist" }, 0] },
        },
      },
      {
        $group: {
          _id: "$subscription.packageId",
          activeCount: {
            $sum: {
              $cond: [{ $in: ["$snapshotStatus", ["active", "trialing"]] }, 1, 0],
            },
          },
          cancelledCount: {
            $sum: {
              $cond: [{ $in: ["$snapshotStatus", ["scheduled_cancel", "canceled"]] }, 1, 0],
            },
          },
          pastDueCount: {
            $sum: {
              $cond: [{ $in: ["$snapshotStatus", ["past_due", "unpaid"]] }, 1, 0],
            },
          },
          partialCount: {
            $sum: { $cond: ["$snapshotPartial", 1, 0] },
          },
        },
      },
    ]);

    const byPackage = Object.fromEntries(
      grouped.map((g) => [
        String(g._id),
        {
          active: g.activeCount,
          cancelled: g.cancelledCount,
          pastDue: g.pastDueCount,
          partial: g.partialCount,
        },
      ])
    );

    let totalPartial = 0;
    for (const g of grouped) {
      totalPartial += g.partialCount;
    }

    let totalActiveCount = 0;
    let totalPastDueCount = 0;
    let totalActiveRevenue = 0;
    let totalPastDueRevenue = 0;

    const packages: MembershipByPackageItemDTO[] = SUBSCRIPTION_PACKAGE_IDS.map((packageId) => {
      const pkg = getPackageById(packageId);
      const price = pkg?.price ?? 0;
      const row = byPackage[packageId];
      const activeCount = row?.active ?? 0;
      const cancelledCount = row?.cancelled ?? 0;
      const pastDueCount = row?.pastDue ?? 0;
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
        snapshotPartial: totalPartial > 0,
      },
    };
  }
}
