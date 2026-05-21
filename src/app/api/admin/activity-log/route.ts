import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import MajorDraw from "@/models/MajorDraw";
import MiniDraw from "@/models/MiniDraw";
import Winner from "@/models/Winner";
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
    | "membership_upgrade"
    | "subscription_past_due";
  user: string;
  userId?: string;
  action: string;
  time: string;
  status: "success" | "info" | "warning" | "error";
  amount?: number;
  timestamp: Date;
  /** For mini-draw purchases: link to /mini-draws/[id] */
  miniDrawId?: string;
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
        userId: user._id.toString(),
        action,
        time: timeAgo,
        status: "success",
        timestamp: user.createdAt,
      });
    });

    // ========================================
    // PAYMENT EVENTS
    // ========================================
    // ✅ CRITICAL FIX: Use .lean() to get plain objects - this properly handles Schema.Types.Mixed fields
    // Mixed type fields are not reliably accessible on Mongoose documents, especially with .populate()
    // .lean() returns plain JavaScript objects where Mixed types are directly accessible
    const payments = await PaymentEvent.find({
      eventType: "BenefitsGranted",
      timestamp: { $gte: startDate },
    })
      .sort({ timestamp: -1 })
      .lean(); // ✅ Use .lean() to get plain objects - Mixed types are now properly accessible

    // ✅ Populate users separately in batch for better performance
    const paymentUserIds = [...new Set(payments.map((p) => (p.userId as mongoose.Types.ObjectId).toString()))];
    const paymentUsers = await User.find({ _id: { $in: paymentUserIds } })
      .select("firstName lastName email subscription")
      .lean();

    const userMap = new Map(paymentUsers.map((u) => [u._id.toString(), u]));

    // Batch fetch MiniDraw titles for mini-draw payments (for "Entered in [title] with X entries")
    const rawMiniDrawIds = [
      ...new Set(
        payments
          .filter((p) => p.packageType === "mini-draw")
          .map((p) => (p.data as Record<string, unknown>)?.miniDrawId as string)
          .filter(Boolean)
      ),
    ];
    const validMiniDrawIds = rawMiniDrawIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const miniDraws =
      validMiniDrawIds.length > 0
        ? await MiniDraw.find({ _id: { $in: validMiniDrawIds } })
            .select("_id name")
            .lean()
        : [];
    type MiniDrawLean = { _id: mongoose.Types.ObjectId; name: string };
    const miniDrawMap = new Map<string, string>(
      (miniDraws as unknown as MiniDrawLean[]).map((d) => [d._id.toString(), d.name])
    );

    console.log(`📊 Activity Log - Found ${payments.length} payment events`);

    payments.forEach((payment) => {
      // ✅ Get user from map (plain object from .lean())
      const userDoc = userMap.get((payment.userId as mongoose.Types.ObjectId).toString());

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
      let type: ActivityLogItem["type"] = "one_time_purchase";

      if (payment.packageType === "membership") {
        // ✅ BEST PRACTICE: Use billing_reason from PaymentEvent data for reliable renewal detection
        // With .lean(), the data field is a plain object and billingReason is directly accessible
        const billingReason = paymentData?.billingReason as string | undefined;

        // ✅ DEBUG: Always log for membership payments to verify data is being read correctly
        console.log("🔍 Activity Log - Checking payment for renewal:", {
          paymentId: payment._id,
          paymentIntentId: payment.paymentIntentId,
          packageType: payment.packageType,
          packageId: payment.packageId,
          packageName: payment.packageName,
          billingReason: billingReason || "undefined",
          hasBillingReason: !!billingReason,
          hasData: !!paymentData,
          dataType: typeof paymentData,
          dataKeys: paymentData ? Object.keys(paymentData) : [],
          fullData: JSON.stringify(paymentData), // Stringify for better logging
          timestamp: payment.timestamp,
        });

        // Check if it's a renewal based on billing_reason
        let isRenewal = billingReason === "subscription_cycle";

        console.log(`🔍 Renewal detection result: ${isRenewal ? "RENEWAL" : "NEW SUBSCRIPTION"}`, {
          billingReason,
          isRenewal,
          paymentId: payment._id,
        });

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
            console.log("🔍 Using fallback renewal detection for payment:", payment._id);
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
        const miniDrawId = paymentData?.miniDrawId as string | undefined;
        const entries = (paymentData?.entries as number | undefined) ?? 0;
        const miniDrawTitle = miniDrawId ? miniDrawMap.get(miniDrawId) : null;
        if (miniDrawId && miniDrawTitle) {
          action = `Entered in "${miniDrawTitle}" with ${entries} ${entries === 1 ? "entry" : "entries"}`;
          type = "one_time_purchase";
        } else {
          action = `Purchased ${packageName}`;
        }
        type = "one_time_purchase";
      }

      if (amount >= 300) {
        type = "high_value_order";
        action = `High-value purchase: ${action} - $${amount}`;
      }

      const activityPayload: ActivityLogItem = {
        id: `payment-${payment._id}`,
        type,
        user: user ? `${user.firstName} ${user.lastName}` : "Unknown User",
        userId: payment.userId ? (payment.userId as mongoose.Types.ObjectId).toString() : undefined,
        action,
        time: timeAgo,
        status: "success",
        amount,
        timestamp: payment.timestamp,
      };
      if (payment.packageType === "mini-draw") {
        const miniDrawId = (payment.data as Record<string, unknown>)?.miniDrawId as string | undefined;
        if (miniDrawId && miniDrawMap.has(miniDrawId)) {
          activityPayload.miniDrawId = miniDrawId;
        }
      }
      activities.push(activityPayload);
    });

    // ========================================
    // SUBSCRIPTION CHANGES
    // ========================================
    const usersWithChanges = await User.find({
      $or: [
        { "subscription.lastUpgradeDate": { $gte: startDate } },
        { "subscription.lastDowngradeDate": { $gte: startDate } },
        { "subscription.cancelledAt": { $gte: startDate } },
        { "subscription.pastDueAt": { $gte: startDate } },
      ],
      isActive: true,
    })
      .sort({
        "subscription.lastUpgradeDate": -1,
        "subscription.lastDowngradeDate": -1,
        "subscription.cancelledAt": -1,
        "subscription.pastDueAt": -1,
      })
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
          userId: user._id.toString(),
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
          userId: user._id.toString(),
          action: `Downgraded subscription from ${previousPackageName} to ${currentPackageName}`,
          time: timeAgo,
          status: "info",
          timestamp: user.subscription.lastDowngradeDate,
        });
      }

      // Check for cancellations - use cancelledAt (when cancellation was triggered) instead of endDate (future period end)
      if (
        user.subscription.cancelledAt &&
        user.subscription.cancelledAt >= startDate &&
        (!user.subscription.lastDowngradeDate ||
          user.subscription.cancelledAt.getTime() !== user.subscription.lastDowngradeDate.getTime())
      ) {
        const timeAgo = getTimeAgo(user.subscription.cancelledAt);
        const packageName = getPackageName(user.subscription.packageId || "Unknown");

        activities.push({
          id: `cancel-${user._id}-${user.subscription.cancelledAt.getTime()}`,
          type: "membership_upgrade",
          user: `${user.firstName} ${user.lastName}`,
          userId: user._id.toString(),
          action: `Cancelled ${packageName} membership`,
          time: timeAgo,
          status: "warning",
          timestamp: user.subscription.cancelledAt,
        });
      }

      // Past due — failed renewal (subscription.status past_due); pastDueAt set on first transition into past_due
      if (user.subscription.pastDueAt && user.subscription.pastDueAt >= startDate) {
        const timeAgo = getTimeAgo(user.subscription.pastDueAt);
        const packageName = getPackageName(user.subscription.packageId || "Unknown");

        activities.push({
          id: `past-due-${user._id}-${user.subscription.pastDueAt.getTime()}`,
          type: "subscription_past_due",
          user: `${user.firstName} ${user.lastName}`,
          userId: user._id.toString(),
          action: `Membership renewal failed — ${packageName}`,
          time: timeAgo,
          status: "error",
          timestamp: user.subscription.pastDueAt,
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
      .select("name updatedAt _id")
      .lean();

    // Get draw IDs
    const drawIds = completedDraws.map((draw) => draw._id);

    // Check for winners in Winner model
    const winners = await Winner.find({
      drawId: { $in: drawIds },
      drawType: "major",
    })
      .select("drawId")
      .lean();

    // Create a set of draw IDs that have winners
    const drawsWithWinners = new Set(winners.map((w: { drawId: { toString(): string } }) => w.drawId.toString()));

    completedDraws.forEach((draw) => {
      const drawTyped = draw as unknown as { _id: { toString(): string }; name: string; updatedAt: Date };
      const drawId = drawTyped._id.toString();
      const timeAgo = getTimeAgo(drawTyped.updatedAt);
      const hasWinner = drawsWithWinners.has(drawId);
      const winnerName = hasWinner ? "Winner selected" : "No winner yet";

      activities.push({
        id: `draw-${drawId}`,
        type: "draw_complete",
        user: "System",
        action: `${drawTyped.name} completed - ${winnerName}`,
        time: timeAgo,
        status: "info",
        timestamp: drawTyped.updatedAt,
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
