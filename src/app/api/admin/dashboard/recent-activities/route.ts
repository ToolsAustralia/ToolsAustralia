import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import MajorDraw from "@/models/MajorDraw";
import Order from "@/models/Order";
import ReferralEvent from "@/models/ReferralEvent";
import mongoose from "mongoose";

export interface RecentActivity {
  id: string;
  type:
    | "user_signup"
    | "membership_purchase"
    | "one_time_purchase"
    | "draw_complete"
    | "high_value_order"
    | "system_alert"
    | "membership_upgrade";
  user: string;
  action: string;
  time: string;
  status: "success" | "info" | "warning" | "error";
  amount?: number;
  timestamp: Date;
}

/**
 * GET /api/admin/dashboard/recent-activities
 * Get recent activities for admin dashboard
 */
export async function GET() {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("📊 Fetching recent activities...");

    const activities: RecentActivity[] = [];
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // ========================================
    // RECENT USER SIGNUPS
    // ========================================
    const recentSignups = await User.find({
      createdAt: { $gte: oneWeekAgo },
      isActive: true,
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("firstName lastName email createdAt _id affiliateReferral");

    // Batch query referral events for all signups to check if they were referred by someone else
    // This is more efficient than querying one by one
    const userIds = recentSignups.map((user) => new mongoose.Types.ObjectId(user._id));
    const referralEvents = await ReferralEvent.find({
      inviteeUserId: { $in: userIds },
      status: { $in: ["pending", "converted"] },
    })
      .select("inviteeUserId referralCode referrerId")
      .lean();

    // Create a map for quick lookup: userId -> referralCode
    // Only include events where the referrer is different from the invitee (defense in depth)
    const referralMap = new Map<string, string>();
    referralEvents.forEach((event) => {
      const inviteeId = event.inviteeUserId?.toString();
      const referrerId = event.referrerId?.toString();
      // Only add if referrer is different from invitee (user can't refer themselves)
      if (inviteeId && referrerId && inviteeId !== referrerId && event.referralCode) {
        referralMap.set(inviteeId, event.referralCode);
      }
    });

    recentSignups.forEach((user) => {
      const timeAgo = getTimeAgo(user.createdAt);
      let action = "Signed up for an account";

      // Check if user was referred by someone else (not their own referral code)
      const usedReferralCode = referralMap.get(user._id.toString());
      if (usedReferralCode) {
        action = `Signed up via friend referral (code: ${usedReferralCode})`;
      }
      // Check for affiliate code
      else if (user.affiliateReferral?.affiliateCode) {
        action = `Signed up via affiliate (code: ${user.affiliateReferral.affiliateCode})`;
      }

      activities.push({
        id: `signup-${user._id}`,
        type: "user_signup",
        user: `${user.firstName} ${user.lastName}`,
        action,
        time: timeAgo,
        status: "success",
        timestamp: user.createdAt,
      });
    });

    // ========================================
    // RECENT PAYMENT EVENTS
    // ========================================
    // ✅ CRITICAL FIX: Use .lean() to get plain objects - this properly handles Schema.Types.Mixed fields
    // Mixed type fields are not reliably accessible on Mongoose documents, especially with .populate()
    // .lean() returns plain JavaScript objects where Mixed types are directly accessible
    const recentPayments = await PaymentEvent.find({
      eventType: "BenefitsGranted",
      timestamp: { $gte: oneWeekAgo },
    })
      .sort({ timestamp: -1 })
      .limit(15)
      .lean(); // ✅ Use .lean() to get plain objects - Mixed types are now properly accessible

    // ✅ Populate users separately in batch for better performance
    const paymentUserIds = [...new Set(recentPayments.map((p) => (p.userId as mongoose.Types.ObjectId).toString()))];
    const paymentUsers = await User.find({ _id: { $in: paymentUserIds } })
      .select("firstName lastName email subscription")
      .lean();

    const userMap = new Map(paymentUsers.map((u) => [u._id.toString(), u]));

    recentPayments.forEach((payment) => {
      // ✅ Get user from map (plain object from .lean())
      const userDoc = userMap.get((payment.userId as mongoose.Types.ObjectId).toString());

      // Handle user data
      type UserType = {
        firstName: string;
        lastName: string;
        email: string;
        subscription?: {
          packageId?: string;
          previousSubscription?: { packageId?: string; packageName?: string };
          lastUpgradeDate?: Date;
          lastDowngradeDate?: Date;
        };
      };

      let user: UserType | null = null;
      if (userDoc) {
        user = userDoc as UserType;
      }

      const timeAgo = getTimeAgo(payment.timestamp);

      // ✅ With .lean(), payment.data is already a plain object - Mixed types are directly accessible
      const paymentData = payment.data as Record<string, unknown> | undefined;

      const amount = (paymentData?.price as number | undefined) || 0;
      const packageName = payment.packageName || "Unknown Package";

      let action = "";
      let type: RecentActivity["type"] = "one_time_purchase";

      // Determine action based on package type and name
      if (payment.packageType === "membership") {
        // ✅ BEST PRACTICE: Use billing_reason from PaymentEvent data for reliable renewal detection
        // With .lean(), the data field is a plain object and billingReason is directly accessible
        const billingReason = paymentData?.billingReason as string | undefined;

        // Check if it's a renewal based on billing_reason
        let isRenewal = billingReason === "subscription_cycle";

        // ✅ FALLBACK: For old PaymentEvent records that don't have billingReason stored
        // Try to infer from user subscription data (less reliable but helps with historical records)
        if (!billingReason && user?.subscription) {
          // If user already has this package and lastUpgradeDate is more than 24 hours ago, likely a renewal
          const hasExistingSubscription =
            user.subscription.packageId === payment.packageId &&
            user.subscription.lastUpgradeDate &&
            new Date(user.subscription.lastUpgradeDate).getTime() < payment.timestamp.getTime() - 24 * 60 * 60 * 1000;

          if (hasExistingSubscription) {
            isRenewal = true;
          }
        }

        if (isRenewal) {
          action = `Renewed ${packageName} subscription`;
        } else {
          action = `Subscribed to ${packageName} Membership Package`;
        }
        type = "membership_purchase";
      } else if (payment.packageType === "one-time") {
        action = `Purchased ${packageName}`;
        type = "one_time_purchase";
      } else if (payment.packageType === "upsell") {
        action = `Purchased ${packageName}`;
        type = "one_time_purchase";
      } else if (payment.packageType === "mini-draw") {
        action = `Purchased ${packageName}`;
        type = "one_time_purchase";
      }

      // Check for high-value orders
      if (amount >= 300) {
        type = "high_value_order";
        action = `High-value purchase: ${action} - $${amount}`;
      }

      activities.push({
        id: `payment-${payment._id}`,
        type,
        user: user ? `${user.firstName} ${user.lastName}` : "Unknown User",
        action,
        time: timeAgo,
        status: "success",
        amount,
        timestamp: payment.timestamp,
      });
    });

    // ========================================
    // SUBSCRIPTION CHANGES (Upgrades, Downgrades, Cancellations)
    // ========================================
    // Find users with recent subscription changes
    const usersWithSubscriptionChanges = await User.find({
      $or: [
        { "subscription.lastUpgradeDate": { $gte: oneWeekAgo } },
        { "subscription.lastDowngradeDate": { $gte: oneWeekAgo } },
        {
          "subscription.isActive": false,
          "subscription.endDate": { $gte: oneWeekAgo },
        },
      ],
      isActive: true,
    })
      .sort({ "subscription.lastUpgradeDate": -1, "subscription.lastDowngradeDate": -1, "subscription.endDate": -1 })
      .limit(10)
      .select("firstName lastName email subscription");

    usersWithSubscriptionChanges.forEach((user) => {
      if (!user.subscription) return;

      // Check for upgrades
      if (user.subscription.lastUpgradeDate && user.subscription.lastUpgradeDate >= oneWeekAgo) {
        const timeAgo = getTimeAgo(user.subscription.lastUpgradeDate);
        const currentPackage = user.subscription.packageId || "Unknown";
        const previousPackage = user.subscription.previousSubscription?.packageId || "Unknown";

        // Get package names (simplified - in production you'd fetch from package data)
        const currentPackageName = getPackageName(currentPackage);
        const previousPackageName =
          user.subscription.previousSubscription?.packageName || getPackageName(previousPackage);

        activities.push({
          id: `upgrade-${user._id}-${user.subscription.lastUpgradeDate.getTime()}`,
          type: "membership_upgrade",
          user: `${user.firstName} ${user.lastName}`,
          action: `Upgraded subscription from ${previousPackageName} to ${currentPackageName}`,
          time: timeAgo,
          status: "success",
          timestamp: user.subscription.lastUpgradeDate,
        });
      }

      // Check for downgrades
      if (user.subscription.lastDowngradeDate && user.subscription.lastDowngradeDate >= oneWeekAgo) {
        const timeAgo = getTimeAgo(user.subscription.lastDowngradeDate);
        const currentPackage = user.subscription.packageId || "Unknown";
        const previousPackage = user.subscription.previousSubscription?.packageId || "Unknown";

        const currentPackageName = getPackageName(currentPackage);
        const previousPackageName =
          user.subscription.previousSubscription?.packageName || getPackageName(previousPackage);

        activities.push({
          id: `downgrade-${user._id}-${user.subscription.lastDowngradeDate.getTime()}`,
          type: "membership_upgrade",
          user: `${user.firstName} ${user.lastName}`,
          action: `Downgraded subscription from ${previousPackageName} to ${currentPackageName}`,
          time: timeAgo,
          status: "info",
          timestamp: user.subscription.lastDowngradeDate,
        });
      }

      // Check for cancellations
      if (
        !user.subscription.isActive &&
        user.subscription.endDate &&
        user.subscription.endDate >= oneWeekAgo &&
        (!user.subscription.lastDowngradeDate ||
          user.subscription.endDate.getTime() !== user.subscription.lastDowngradeDate.getTime())
      ) {
        const timeAgo = getTimeAgo(user.subscription.endDate);
        const packageName = getPackageName(user.subscription.packageId || "Unknown");

        activities.push({
          id: `cancel-${user._id}-${user.subscription.endDate.getTime()}`,
          type: "membership_upgrade",
          user: `${user.firstName} ${user.lastName}`,
          action: `Cancelled ${packageName} membership`,
          time: timeAgo,
          status: "warning",
          timestamp: user.subscription.endDate,
        });
      }
    });

    // ========================================
    // RECENT MAJOR DRAW COMPLETIONS
    // ========================================
    const recentCompletedDraws = await MajorDraw.find({
      status: "completed",
      updatedAt: { $gte: oneWeekAgo },
    })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select("name winner updatedAt");

    recentCompletedDraws.forEach((draw) => {
      const timeAgo = getTimeAgo(draw.updatedAt);
      const winnerName = draw.winner?.userId ? "Winner selected" : "No winner yet";

      activities.push({
        id: `draw-${draw._id}`,
        type: "draw_complete",
        user: "System",
        action: `${draw.name} completed - ${winnerName}`,
        time: timeAgo,
        status: "info",
        timestamp: draw.updatedAt,
      });
    });

    // ========================================
    // RECENT HIGH-VALUE ORDERS
    // ========================================
    const recentOrders = await Order.find({
      createdAt: { $gte: oneWeekAgo },
      totalAmount: { $gte: 200 },
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("user", "firstName lastName");

    recentOrders.forEach((order) => {
      // Handle populated user - it could be an ObjectId or populated user object
      let user: { firstName: string; lastName: string } | null = null;
      const populatedUser = order.user as unknown;
      if (
        populatedUser &&
        typeof populatedUser === "object" &&
        "firstName" in populatedUser &&
        "lastName" in populatedUser
      ) {
        user = populatedUser as { firstName: string; lastName: string };
      }

      const timeAgo = getTimeAgo(order.createdAt);

      activities.push({
        id: `order-${order._id}`,
        type: "high_value_order",
        user: user ? `${user.firstName} ${user.lastName}` : "Unknown User",
        action: `Purchased $${order.totalAmount} worth of tools`,
        time: timeAgo,
        status: "success",
        amount: order.totalAmount,
        timestamp: order.createdAt,
      });
    });

    // Sort all activities by timestamp (most recent first)
    activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Return top 20 most recent activities
    const recentActivities = activities.slice(0, 20);

    console.log(`✅ Found ${recentActivities.length} recent activities`);

    return NextResponse.json({
      success: true,
      data: recentActivities,
    });
  } catch (error) {
    console.error("❌ Error fetching recent activities:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch recent activities",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Helper function to calculate time ago
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return `${diffInSeconds} sec ago`;
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} min ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }
}

// Helper function to get package name from package ID
function getPackageName(packageId: string): string {
  // Map common package IDs to names
  const packageMap: Record<string, string> = {
    "tradie-subscription": "Tradie",
    "foreman-subscription": "Foreman",
    "boss-subscription": "Boss",
    "apprentice-pack": "Apprentice Pack",
    "tradie-pack": "Tradie Pack",
    "foreman-pack": "Foreman Pack",
    "boss-pack": "Boss Pack",
  };

  return packageMap[packageId] || packageId;
}
