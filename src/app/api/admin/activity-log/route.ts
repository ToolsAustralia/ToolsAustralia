import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import MajorDraw from "@/models/MajorDraw";
import ReferralEvent from "@/models/ReferralEvent";
import mongoose from "mongoose";

export interface ActivityLogItem {
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
 * GET /api/admin/activity-log
 * Get paginated activity log with filters
 *
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 25)
 * - type: Filter by activity type (optional)
 * - search: Search term (optional)
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
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "25", 10);
    const typeFilter = searchParams.get("type");
    const searchTerm = searchParams.get("search")?.toLowerCase() || "";

    console.log("📊 Fetching activity log...", { page, limit, typeFilter, searchTerm });

    const activities: ActivityLogItem[] = [];
    const now = new Date();
    // Get activities from last 90 days for pagination
    const startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // ========================================
    // USER SIGNUPS
    // ========================================
    const signups = await User.find({
      createdAt: { $gte: startDate },
      isActive: true,
    })
      .sort({ createdAt: -1 })
      .select("firstName lastName email createdAt _id affiliateReferral");

    // Batch query referral events for all signups to check if they were referred by someone else
    // This is more efficient than querying one by one, especially for large datasets
    const userIds = signups.map((user) => new mongoose.Types.ObjectId(user._id));
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

    signups.forEach((user) => {
      const timeAgo = getTimeAgo(user.createdAt);
      let action = "Signed up for an account";

      // Check if user was referred by someone else (not their own referral code)
      const usedReferralCode = referralMap.get(user._id.toString());
      if (usedReferralCode) {
        action = `Signed up via friend referral (code: ${usedReferralCode})`;
      } else if (user.affiliateReferral?.affiliateCode) {
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
    // PAYMENT EVENTS
    // ========================================
    const payments = await PaymentEvent.find({
      eventType: "BenefitsGranted",
      timestamp: { $gte: startDate },
    })
      .sort({ timestamp: -1 })
      .populate("userId", "firstName lastName email subscription");

    payments.forEach((payment) => {
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
      let type: ActivityLogItem["type"] = "one_time_purchase";

      if (payment.packageType === "membership") {
        // ✅ IMPROVED: Use billing_reason from PaymentEvent data for reliable renewal detection
        // This is more accurate than checking lastUpgradeDate, which may not be set for all renewals
        const billingReason = payment.data?.billingReason as string | undefined;
        const isRenewal = billingReason === "subscription_cycle";

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
    // SUBSCRIPTION CHANGES
    // ========================================
    const usersWithChanges = await User.find({
      $or: [
        { "subscription.lastUpgradeDate": { $gte: startDate } },
        { "subscription.lastDowngradeDate": { $gte: startDate } },
        {
          "subscription.isActive": false,
          "subscription.endDate": { $gte: startDate },
        },
      ],
      isActive: true,
    })
      .sort({ "subscription.lastUpgradeDate": -1, "subscription.lastDowngradeDate": -1, "subscription.endDate": -1 })
      .select("firstName lastName email subscription");

    usersWithChanges.forEach((user) => {
      if (!user.subscription) return;

      if (user.subscription.lastUpgradeDate && user.subscription.lastUpgradeDate >= startDate) {
        const timeAgo = getTimeAgo(user.subscription.lastUpgradeDate);
        const currentPackage = user.subscription.packageId || "Unknown";
        const previousPackage = user.subscription.previousSubscription?.packageId || "Unknown";
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

      if (user.subscription.lastDowngradeDate && user.subscription.lastDowngradeDate >= startDate) {
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

      if (
        !user.subscription.isActive &&
        user.subscription.endDate &&
        user.subscription.endDate >= startDate &&
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
    // DRAW COMPLETIONS
    // ========================================
    const completedDraws = await MajorDraw.find({
      status: "completed",
      updatedAt: { $gte: startDate },
    })
      .sort({ updatedAt: -1 })
      .select("name winner updatedAt");

    completedDraws.forEach((draw) => {
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

    // Sort all activities by timestamp (most recent first)
    activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply filters
    let filteredActivities = activities;
    if (typeFilter) {
      filteredActivities = filteredActivities.filter((a) => a.type === typeFilter);
    }
    if (searchTerm) {
      filteredActivities = filteredActivities.filter(
        (a) => a.user.toLowerCase().includes(searchTerm) || a.action.toLowerCase().includes(searchTerm)
      );
    }

    // Calculate pagination
    const total = filteredActivities.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedActivities = filteredActivities.slice(startIndex, endIndex);

    console.log(`✅ Activity log: ${paginatedActivities.length} of ${total} activities`);

    return NextResponse.json({
      success: true,
      data: {
        activities: paginatedActivities,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error fetching activity log:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch activity log",
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
