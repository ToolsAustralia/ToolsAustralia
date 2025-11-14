import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import MajorDraw from "@/models/MajorDraw";

/**
 * GET /api/admin/dashboard/stats
 * Get comprehensive dashboard statistics for admin overview
 *
 * Returns real-time data for:
 * - User statistics (total, active subscriptions, new signups, profile completion)
 * - Revenue statistics (today, month, breakdown by package type)
 * - Major draw statistics (total entries, active draws)
 * - Conversion rate (paying customers / total users)
 */
export async function GET() {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("📊 Fetching admin dashboard stats...");

    // Calculate date ranges
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // ========================================
    // USER STATISTICS
    // ========================================
    const [totalUsers, activeSubscriptions, newSignupsToday, usersWithCompletedProfiles] = await Promise.all([
      User.countDocuments({ isActive: true }),
      User.countDocuments({
        "subscription.isActive": true,
        isActive: true,
      }),
      User.countDocuments({
        createdAt: { $gte: startOfToday },
        isActive: true,
      }),
      User.countDocuments({
        profileSetupCompleted: true,
        isActive: true,
      }),
    ]);

    // Calculate profile completion rate
    const profileCompletionRate = totalUsers > 0 ? Math.round((usersWithCompletedProfiles / totalUsers) * 100) : 0;

    // ========================================
    // REVENUE STATISTICS
    // ========================================
    // Get revenue from PaymentEvent model (all successful payments)
    const revenueEvents = await PaymentEvent.find({
      eventType: "BenefitsGranted", // Only count successful payments
    });

    // Calculate revenue breakdowns
    let todayRevenue = 0;
    let monthRevenue = 0;
    let subscriptionRevenue = 0;
    let oneTimeRevenue = 0; // Includes: one-time, upsell, mini-draw packages

    revenueEvents.forEach((event) => {
      const eventDate = new Date(event.timestamp);
      const price = event.data?.price || 0;

      // Today's revenue
      if (eventDate >= startOfToday) {
        todayRevenue += price;
      }

      // Monthly revenue
      if (eventDate >= startOfMonth) {
        monthRevenue += price;
      }

      // Package type breakdown
      if (event.packageType === "subscription") {
        subscriptionRevenue += price;
      } else {
        // All non-subscription payments: one-time, upsell, mini-draw
        oneTimeRevenue += price;
      }
    });

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
    // CONVERSION RATE
    // ========================================
    // Calculate as: (Users with active subscription OR one-time packages) / Total users * 100
    // Get unique users who have made any purchase (subscription OR one-time)
    const payingUsers = await User.countDocuments({
      $or: [{ "subscription.isActive": true }, { oneTimePackages: { $exists: true, $not: { $size: 0 } } }],
      isActive: true,
    });

    const conversionRate = totalUsers > 0 ? Math.round((payingUsers / totalUsers) * 100) : 0;

    // ========================================
    // RESPONSE
    // ========================================
    const stats = {
      users: {
        total: totalUsers,
        activeSubscriptions,
        newToday: newSignupsToday,
        profileCompletion: profileCompletionRate,
      },
      revenue: {
        today: todayRevenue,
        month: monthRevenue,
        breakdown: {
          subscriptions: subscriptionRevenue,
          oneTimePackages: oneTimeRevenue,
        },
      },
      majorDraw: {
        totalEntries,
        activeDraws: activeDrawsCount,
      },
      conversionRate,
    };

    console.log("✅ Admin dashboard stats calculated:", {
      totalUsers,
      activeSubscriptions,
      todayRevenue,
      monthRevenue,
      totalEntries,
      conversionRate,
    });

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("❌ Error fetching admin dashboard stats:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch dashboard statistics",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
