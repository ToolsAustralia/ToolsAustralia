import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import MajorDraw from "@/models/MajorDraw";
import Order from "@/models/Order";

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
      .select("firstName lastName email createdAt referral affiliateReferral");

    recentSignups.forEach((user) => {
      const timeAgo = getTimeAgo(user.createdAt);
      let action = "Signed up for an account";

      // Check for friend referral
      if (user.referral?.code) {
        action = `Signed up via friend referral (code: ${user.referral.code})`;
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
    const recentPayments = await PaymentEvent.find({
      eventType: "BenefitsGranted",
      timestamp: { $gte: oneWeekAgo },
    })
      .sort({ timestamp: -1 })
      .limit(15)
      .populate("userId", "firstName lastName email subscription");

    recentPayments.forEach((payment) => {
      // Handle populated userId - it could be an ObjectId or populated user object
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
      const populatedUser = payment.userId as unknown;
      if (
        populatedUser &&
        typeof populatedUser === "object" &&
        "firstName" in populatedUser &&
        "lastName" in populatedUser &&
        "email" in populatedUser
      ) {
        user = populatedUser as UserType;
      }

      const timeAgo = getTimeAgo(payment.timestamp);
      const amount = payment.data?.price || 0;
      const packageName = payment.packageName || "Unknown Package";

      let action = "";
      let type: RecentActivity["type"] = "one_time_purchase";

      // Determine action based on package type and name
      if (payment.packageType === "subscription") {
        // Check if this is a renewal (user already had this package)
        const isRenewal =
          user?.subscription?.packageId === payment.packageId &&
          user?.subscription?.lastUpgradeDate &&
          new Date(user.subscription.lastUpgradeDate).getTime() < payment.timestamp.getTime() - 24 * 60 * 60 * 1000; // More than 24 hours ago

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
