import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import MajorDraw from "@/models/MajorDraw";
import { getStartOfTodayInAEST } from "@/utils/common/timezone";
import { subDays } from "date-fns";

/**
 * GET /api/admin/dashboard/stats
 * Get comprehensive dashboard statistics for admin overview
 *
 * Query Parameters:
 * - dateRange: "today" | "yesterday" | "all-time" | "custom" (default: "today")
 * - startDate: ISO date string (required if dateRange is "custom")
 * - endDate: ISO date string (required if dateRange is "custom")
 *
 * Returns real-time data for:
 * - User statistics (total, active subscriptions, new signups, profile completion)
 * - Revenue statistics (filtered by date range, breakdown by package type)
 * - Major draw statistics (total entries, active draws)
 * - Conversion rate (paying customers / total users)
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
    const dateRange = (searchParams.get("dateRange") as "today" | "yesterday" | "all-time" | "custom") || "today";
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    console.log("📊 Fetching admin dashboard stats...", { dateRange });

    // Calculate date range based on selection
    let startDate: Date;
    let endDate: Date = new Date(); // End date is always now

    const startOfToday = getStartOfTodayInAEST();

    switch (dateRange) {
      case "today":
        startDate = startOfToday;
        break;
      case "yesterday":
        // Get yesterday's start (24 hours before today's start)
        const yesterdayStart = subDays(startOfToday, 1);
        startDate = yesterdayStart;
        endDate = startOfToday; // End at start of today
        break;
      case "all-time":
        startDate = new Date(0); // Beginning of time
        break;
      case "custom":
        if (!startDateParam || !endDateParam) {
          return NextResponse.json({ error: "startDate and endDate are required for custom range" }, { status: 400 });
        }
        startDate = new Date(startDateParam);
        endDate = new Date(endDateParam);
        break;
      default:
        startDate = startOfToday;
    }

    // ========================================
    // USER STATISTICS
    // ========================================
    // For user stats, we always show all-time totals (not filtered by date range)
    // But new signups are filtered by date range
    const [totalUsers, activeSubscriptions, newSignupsInRange, usersWithCompletedProfiles] = await Promise.all([
      User.countDocuments({ isActive: true }),
      User.countDocuments({
        "subscription.isActive": true,
        isActive: true,
      }),
      User.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
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
    // Get revenue from PaymentEvent model filtered by date range
    const revenueEvents = await PaymentEvent.find({
      eventType: "BenefitsGranted", // Only count successful payments
      timestamp: { $gte: startDate, $lte: endDate },
    });

    // Calculate revenue breakdowns
    let totalRevenue = 0;
    let subscriptionRevenue = 0;
    let oneTimeRevenue = 0; // Includes: one-time, upsell, mini-draw packages

    revenueEvents.forEach((event) => {
      const price = event.data?.price || 0;
      totalRevenue += price;

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
    // CONVERSION RATE (Date Range Aware)
    // ========================================
    // Calculate as: (Users who signed up in range AND have made a purchase) / (Users who signed up in range) * 100
    // For "all-time": (All paying users) / (All users) * 100

    let conversionRate = 0;

    if (dateRange === "all-time") {
      // All-time conversion rate: all paying users / all users
      const payingUsers = await User.countDocuments({
        $or: [
          { "subscription.isActive": true },
          { oneTimePackages: { $exists: true, $not: { $size: 0 } } },
          { miniDrawPackages: { $exists: true, $not: { $size: 0 } } },
        ],
        isActive: true,
      });
      conversionRate = totalUsers > 0 ? Math.round((payingUsers / totalUsers) * 100) : 0;
    } else {
      // Date-range specific conversion rate
      // Get users who signed up in the date range
      const usersInRange = newSignupsInRange; // Already calculated above

      // Get users who signed up in range AND have made at least one purchase (anytime)
      // This shows the conversion rate of users who signed up in that period
      const convertedUsersInRange = await User.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
        $or: [
          { "subscription.isActive": true },
          { oneTimePackages: { $exists: true, $not: { $size: 0 } } },
          { miniDrawPackages: { $exists: true, $not: { $size: 0 } } },
        ],
        isActive: true,
      });

      conversionRate = usersInRange > 0 ? Math.round((convertedUsersInRange / usersInRange) * 100) : 0;
    }

    // ========================================
    // RESPONSE
    // ========================================
    const stats = {
      users: {
        total: totalUsers,
        activeSubscriptions,
        newInRange: newSignupsInRange,
        profileCompletion: profileCompletionRate,
      },
      revenue: {
        total: totalRevenue,
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
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        range: dateRange,
      },
    };

    console.log("✅ Admin dashboard stats calculated:", {
      totalUsers,
      activeSubscriptions,
      totalRevenue,
      totalEntries,
      conversionRate,
      dateRange,
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
