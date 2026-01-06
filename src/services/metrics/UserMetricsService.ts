/**
 * User Metrics Service
 * 
 * Business logic for aggregating user analytics and metrics.
 */

import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import ReferralEvent from "@/models/ReferralEvent";
import connectDB from "@/lib/mongodb";
import type { UserMetrics, UserMetricsQuery } from "@/types/metrics/UserMetrics";

export class UserMetricsService {
  /**
   * Get aggregated user metrics
   */
  async getUserMetrics(query: UserMetricsQuery = {}): Promise<UserMetrics> {
    await connectDB();

    const startDate = query.startDate || new Date(0); // Beginning of time if not specified
    const endDate = query.endDate || new Date(); // Now if not specified

    // Get all users created in the date range
    const users = await User.find({
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
    })
      .select("_id affiliateReferral referral profession subscription createdAt")
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

    // Aggregate membership status
    const membershipStatus = {
      active: 0,
      cancelled: 0,
      expired: 0,
      renewed: 0,
    };

    // Track renewals (users who cancelled and then resubscribed)
    const userRenewalMap = new Map<string, boolean>();

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

      // Aggregate profession
      if (user.profession) {
        profession[user.profession] = (profession[user.profession] || 0) + 1;
      }

      // Check membership status
      if (user.subscription) {
        if (user.subscription.isActive) {
          membershipStatus.active++;
        } else if (user.subscription.status === "canceled" || user.subscription.status === "cancelled") {
          membershipStatus.cancelled++;
          
          // Check if user has renewed (has subscription history indicating renewal)
          // This is a simplified check - in production, you might want to track renewal events explicitly
          if (user.subscription.endDate && user.subscription.startDate) {
            const endDate = new Date(user.subscription.endDate);
            const startDate = new Date(user.subscription.startDate);
            // If end date is after start date, it might indicate a renewal
            // For now, we'll check if there's a subscription that was reactivated
            const userId = user._id.toString();
            if (!userRenewalMap.has(userId)) {
              userRenewalMap.set(userId, false);
            }
          }
        } else if (user.subscription.endDate && new Date(user.subscription.endDate) < new Date()) {
          membershipStatus.expired++;
        }
      }
    }

    // Get purchase history from PaymentEvents
    const paymentEvents = await PaymentEvent.find({
      eventType: "BenefitsGranted",
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
    })
      .select("packageType data.price")
      .lean()
      .exec();

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

    // Count renewals using PaymentEvent billingReason (matches activity logs logic)
    // This is the most accurate way to count renewals
    const renewalEvents = await PaymentEvent.find({
      eventType: "BenefitsGranted",
      packageType: "membership",
      "data.billingReason": "subscription_cycle",
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
    })
      .select("_id")
      .lean()
      .exec();

    membershipStatus.renewed = renewalEvents.length;

    return {
      signupSource,
      profession,
      membershipStatus,
      purchaseHistory,
      dateRange: {
        startDate,
        endDate,
      },
    };
  }
}

