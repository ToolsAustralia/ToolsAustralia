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
      .select("firstName lastName email createdAt");

    recentSignups.forEach((user) => {
      const timeAgo = getTimeAgo(user.createdAt);
      activities.push({
        id: `signup-${user._id}`,
        type: "user_signup",
        user: `${user.firstName} ${user.lastName}`,
        action: "Signed up for an account",
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
      .populate("userId", "firstName lastName email");

    recentPayments.forEach((payment) => {
      const user = payment.userId as { firstName: string; lastName: string; email: string } | null;
      const timeAgo = getTimeAgo(payment.timestamp);
      const amount = payment.data?.price || 0;

      let action = "";
      let type: RecentActivity["type"] = "one_time_purchase";

      if (payment.packageType === "subscription") {
        action = "Purchased subscription membership";
        type = "membership_purchase";
      } else if (payment.packageType === "one-time") {
        action = "Purchased one-time package";
        type = "one_time_purchase";
      } else if (payment.packageType === "upsell") {
        action = "Purchased upsell package";
        type = "one_time_purchase";
      } else if (payment.packageType === "mini-draw") {
        action = "Purchased mini-draw package";
        type = "one_time_purchase";
      }

      if (amount >= 300) {
        type = "high_value_order";
        action = `High-value purchase: $${amount}`;
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
      .populate("userId", "firstName lastName");

    recentOrders.forEach((order) => {
      const user = order.userId as { firstName: string; lastName: string } | null;
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
