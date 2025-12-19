import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";

/**
 * GET /api/admin/dashboard/projected-income
 * Get projected income for next month based on active subscriptions with auto-renewal enabled
 *
 * Returns:
 * - projectedIncome: Total expected revenue from subscriptions that will auto-renew
 * - activeSubscriptions: Count of subscriptions that will renew
 * - nextMonthStart: Start date of next month (ISO string)
 * - nextMonthEnd: End date of next month (ISO string)
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find users with active subscriptions that WILL auto-renew
    // Only count subscriptions where autoRenew !== false (includes true and undefined, since default is true)
    const activeSubscribers = await User.find({
      "subscription.isActive": true,
      "subscription.autoRenew": { $ne: false }, // Only count if autoRenew is true or undefined
      isActive: true,
    }).select("subscription.packageId subscription.autoRenew");

    // Calculate projected income
    let projectedIncome = 0;
    let activeSubscriptions = 0;

    activeSubscribers.forEach((user) => {
      // Double-check autoRenew (defensive programming)
      if (user.subscription?.autoRenew === false) {
        return; // Skip cancelled subscriptions
      }

      const packageId = user.subscription?.packageId;
      if (packageId) {
        const pkg = getPackageById(packageId);
        if (pkg && pkg.price) {
          projectedIncome += pkg.price;
          activeSubscriptions++;
        }
      }
    });

    // Calculate next month's date range
    const now = new Date();
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0); // Last day of next month

    return NextResponse.json({
      success: true,
      data: {
        projectedIncome: Math.round(projectedIncome * 100) / 100, // Round to 2 decimal places
        activeSubscriptions,
        nextMonthStart: nextMonthStart.toISOString(),
        nextMonthEnd: nextMonthEnd.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching projected income:", error);
    return NextResponse.json(
      { error: "Failed to fetch projected income", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
