/**
 * User Metrics Service
 * 
 * Business logic for aggregating user analytics and metrics.
 */

import User from "@/models/User";
import {
  aggregateNetCountWithMatch,
  fetchNetBenefitsGrantedInRange,
} from "@/utils/payment/payment-event-net-queries";
import ReferralEvent from "@/models/ReferralEvent";
import connectDB from "@/lib/mongodb";
import type { UserMetrics, UserMetricsQuery } from "@/types/metrics/UserMetrics";
import { formatInTimeZone } from "date-fns-tz";
import MembershipDailySnapshot from "@/models/MembershipDailySnapshot";
import { getAgeGroup, AGE_GROUP_ORDER, type AgeGroupLabel } from "@/utils/metrics/age-grouping";
import { normalizeProfession, bucketUnmatched } from "@/utils/metrics/profession-normalize";
import { membershipPackages } from "@/data/membershipPackages";

export class UserMetricsService {
  /**
   * Get aggregated user metrics
   */
  async getUserMetrics(query: UserMetricsQuery = {}): Promise<UserMetrics> {
    await connectDB();

    const startDate = query.startDate || new Date(0); // Beginning of time if not specified
    const endDate = query.endDate || new Date(); // Now if not specified
    const asOfDate = query.asOfDate ?? null;

    // Get all users created in the date range
    const users = await User.find({
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
    })
      .select("_id affiliateReferral referral profession subscription createdAt birthdate")
      .lean()
      .exec();

    // Get all referral events for users in this date range
    // This tells us who was referred by whom (excluding self-referrals)
    const userIds = users.map((u) => u._id);
    const referralEvents = await ReferralEvent.find({
      inviteeUserId: { $in: userIds },
      status: { $in: ["pending", "converted"] }, // Only count valid referrals
    })
      .select("inviteeUserId referrerId")
      .lean()
      .exec();

    // Create a set of user IDs who were referred by someone else (not themselves)
    const referredUserIds = new Set<string>();
    referralEvents.forEach((event) => {
      const inviteeId = event.inviteeUserId?.toString();
      const referrerId = event.referrerId?.toString();
      // Only count if referrer is different from invitee (exclude self-referrals)
      if (inviteeId && referrerId && inviteeId !== referrerId) {
        referredUserIds.add(inviteeId);
      }
    });

    // Aggregate signup sources
    const signupSource = {
      affiliate: 0,
      referral: 0,
      direct: 0,
      organic: 0,
      social: 0,
    };

    // Aggregate professions
    const profession: Record<string, number> = {};

    // Aggregate age groups — initialize every bucket so empty buckets render as 0
    const ageGroup: Record<AgeGroupLabel, number> = AGE_GROUP_ORDER.reduce(
      (acc, label) => {
        acc[label] = 0;
        return acc;
      },
      {} as Record<AgeGroupLabel, number>
    );

    // Aggregate membership status
    const membershipStatus = {
      active: 0,
      cancelled: 0,
      pastDue: 0,
      renewed: 0,
    };

    // Track renewals (users who cancelled and then resubscribed)
    const userRenewalMap = new Map<string, boolean>();

    // Per-package membership breakdown — initialize only for subscription packages
    // so the table shape is stable even if a package has 0 members.
    type PackageCounts = { active: number; pastDue: number; cancelled: number };
    const perPackage = new Map<string, { name: string; counts: PackageCounts }>();
    for (const pkg of membershipPackages) {
      if (pkg.type === "subscription") {
        perPackage.set(pkg._id, { name: pkg.name, counts: { active: 0, pastDue: 0, cancelled: 0 } });
      }
    }

    // Fallback bucket: catches classified subscriptions whose packageId doesn't match any
    // known subscription package (legacy ObjectId values, one-time packageIds in the
    // subscription.packageId slot, deleted packages). Ensures grand-total of the per-package
    // breakdown reconciles with `membershipStatus.{active+pastDue+cancelled}`.
    const OTHER_PACKAGE_ID = "__other__";
    const OTHER_PACKAGE_NAME = "Other / Unknown";
    perPackage.set(OTHER_PACKAGE_ID, {
      name: OTHER_PACKAGE_NAME,
      counts: { active: 0, pastDue: 0, cancelled: 0 },
    });

    for (const user of users) {
      const userId = user._id.toString();
      
      // Determine signup source
      // Priority: Affiliate > Referral (by someone else) > Direct
      if (user.affiliateReferral?.affiliateId) {
        signupSource.affiliate++;
      } else if (referredUserIds.has(userId)) {
        // User was referred by someone else (not themselves)
        signupSource.referral++;
      } else {
        signupSource.direct++;
      }

      // Aggregate profession (normalized — folds typos/casing/plurals/synonyms)
      const normalizedProfession = normalizeProfession(user.profession);
      if (normalizedProfession !== "Unknown") {
        profession[normalizedProfession] = (profession[normalizedProfession] || 0) + 1;
      }

      // Aggregate age group from birthdate
      ageGroup[getAgeGroup(user.birthdate as Date | undefined)]++;

      // Check membership status (flat totals + per-package breakdown)
      if (user.subscription) {
        // Coerce to string: legacy users may have ObjectId stored in this Mixed field.
        const rawPkgId = user.subscription.packageId;
        const pkgKey = rawPkgId != null ? String(rawPkgId) : null;
        const matchedEntry = pkgKey ? perPackage.get(pkgKey) : undefined;
        // Fallback ensures the per-package breakdown reconciles with the flat totals.
        const pkgEntry = matchedEntry ?? perPackage.get(OTHER_PACKAGE_ID)!;
        const bumpPackage = (key: keyof PackageCounts) => {
          pkgEntry.counts[key]++;
        };

        // Cancelled: "active"/"past_due" with endDate set → scheduled cancel-at-period-end
        if (
          (user.subscription.status === "active" || user.subscription.status === "past_due") &&
          user.subscription.endDate &&
          user.subscription.endDate !== null
        ) {
          membershipStatus.cancelled++;
          bumpPackage("cancelled");

          if (user.subscription.startDate) {
            const userIdStr = user._id.toString();
            if (!userRenewalMap.has(userIdStr)) {
              userRenewalMap.set(userIdStr, false);
            }
          }
        }
        // Past Due: status === "past_due" with no endDate
        else if (user.subscription.status === "past_due") {
          membershipStatus.pastDue++;
          bumpPackage("pastDue");
        }
        // Active: isActive && status === "active"
        else if (user.subscription.isActive && user.subscription.status === "active") {
          membershipStatus.active++;
          bumpPackage("active");
        }
        // Legacy cancelled
        else if (user.subscription.status === "canceled" || user.subscription.status === "cancelled") {
          membershipStatus.cancelled++;
          bumpPackage("cancelled");
        }
      }
    }

    if (asOfDate) {
      const dateKey = formatInTimeZone(asOfDate, "Australia/Sydney", "yyyy-MM-dd");
      const snapshotRows = await MembershipDailySnapshot.find({ date: dateKey }).lean();
      if (snapshotRows.length > 0) {
        const totals = snapshotRows.reduce(
          (acc, r) => {
            acc.active += r.activeCount;
            acc.cancelled += r.cancelledCount + r.scheduledCancelCount;
            acc.pastDue += r.pastDueCount;
            return acc;
          },
          { active: 0, cancelled: 0, pastDue: 0 }
        );
        membershipStatus.active = totals.active;
        membershipStatus.cancelled = totals.cancelled;
        membershipStatus.pastDue = totals.pastDue;
        // membershipStatus.renewed stays as-is — it's a range-driven delta from PaymentEvent.
      }
    }

    const paymentEvents = await fetchNetBenefitsGrantedInRange(startDate, endDate, {
      packageType: 1,
      data: 1,
    });

    const purchaseHistory = {
      totalPurchases: paymentEvents.length,
      totalRevenue: 0,
      averageOrderValue: 0,
      byPackageType: {} as Record<string, number>,
    };

    for (const event of paymentEvents) {
      const price = event.data?.price || 0;
      purchaseHistory.totalRevenue += price;
      
      const packageType = event.packageType || "unknown";
      purchaseHistory.byPackageType[packageType] = (purchaseHistory.byPackageType[packageType] || 0) + 1;
    }

    if (purchaseHistory.totalPurchases > 0) {
      purchaseHistory.averageOrderValue = purchaseHistory.totalRevenue / purchaseHistory.totalPurchases;
    }

    membershipStatus.renewed = await aggregateNetCountWithMatch({
      packageType: "membership",
      "data.billingReason": "subscription_cycle",
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    const membershipByPackage = Array.from(perPackage.entries())
      .map(([packageId, { name, counts }]) => ({
        packageId,
        packageName: name,
        total: counts.active + counts.pastDue + counts.cancelled,
        active: counts.active,
        pastDue: counts.pastDue,
        cancelled: counts.cancelled,
      }))
      // Hide the synthetic "Other / Unknown" bucket when it has zero members so the table
      // stays clean for healthy data; surface it only when reconciliation actually needs it.
      .filter((row) => row.packageId !== OTHER_PACKAGE_ID || row.total > 0);

    const bucketedProfession = bucketUnmatched(profession, 5);

    return {
      signupSource,
      profession: bucketedProfession,
      ageGroup,
      membershipStatus,
      membershipByPackage,
      purchaseHistory,
      dateRange: {
        startDate,
        endDate,
      },
    };
  }
}

