import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { getActiveSubscriptionFilter } from "@/utils/admin/userFilterBuilder";

const SUBSCRIPTION_PACKAGE_IDS = [
  "tradie-subscription",
  "foreman-subscription",
  "boss-subscription",
] as const;

/**
 * GET /api/admin/dashboard/membership-by-package
 * Get membership counts per subscription package (active, cancelled, past_due) and revenue
 *
 * Counts are mutually exclusive:
 * - Active: will renew (status active, autoRenew not false)
 * - Cancelled: scheduled to cancel (status active, autoRenew false, has endDate) — excludes past_due
 * - Past due: payment failed (status past_due), regardless of autoRenew
 *
 * Returns:
 * - packages: [{ packageId, packageName, activeCount, cancelledCount, pastDueCount, activeRevenue, pastDueRevenue }]
 * - summary: { totalActiveCount, totalPastDueCount, totalActiveRevenue, totalPastDueRevenue }
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const baseMatch = {
      "subscription.packageId": { $in: [...SUBSCRIPTION_PACKAGE_IDS] },
      isActive: true,
    };

    const [activeResults, cancelledResults, pastDueResults] = await Promise.all([
      // Active = will renew (status active, autoRenew not false)
      User.aggregate([
        { $match: { ...baseMatch, ...getActiveSubscriptionFilter(false) } },
        { $group: { _id: "$subscription.packageId", count: { $sum: 1 } } },
      ]),
      // Cancelled = scheduled to cancel (active only; past_due users go in past_due bucket)
      User.aggregate([
        {
          $match: {
            ...baseMatch,
            "subscription.status": "active",
            "subscription.autoRenew": false,
            "subscription.endDate": { $exists: true, $ne: null },
          },
        },
        { $group: { _id: "$subscription.packageId", count: { $sum: 1 } } },
      ]),
      // Past due = payment failed (all past_due regardless of autoRenew)
      User.aggregate([
        {
          $match: {
            ...baseMatch,
            "subscription.status": "past_due",
            "subscription.packageId": { $exists: true, $nin: [null, ""] },
          },
        },
        { $group: { _id: "$subscription.packageId", count: { $sum: 1 } } },
      ]),
    ]);

    const activeByPackage = Object.fromEntries(
      activeResults.map((r) => [r._id, r.count])
    );
    const cancelledByPackage = Object.fromEntries(
      cancelledResults.map((r) => [r._id, r.count])
    );
    const pastDueByPackage = Object.fromEntries(
      pastDueResults.map((r) => [r._id, r.count])
    );

    let totalActiveCount = 0;
    let totalPastDueCount = 0;
    let totalActiveRevenue = 0;
    let totalPastDueRevenue = 0;

    const packages = SUBSCRIPTION_PACKAGE_IDS.map((packageId) => {
      const pkg = getPackageById(packageId);
      const price = pkg?.price ?? 0;
      const activeCount = activeByPackage[packageId] ?? 0;
      const pastDueCount = pastDueByPackage[packageId] ?? 0;
      const activeRevenue = Math.round(activeCount * price * 100) / 100;
      const pastDueRevenue = Math.round(pastDueCount * price * 100) / 100;
      totalActiveCount += activeCount;
      totalPastDueCount += pastDueCount;
      totalActiveRevenue += activeRevenue;
      totalPastDueRevenue += pastDueRevenue;
      return {
        packageId,
        packageName: pkg?.name ?? packageId,
        activeCount,
        cancelledCount: cancelledByPackage[packageId] ?? 0,
        pastDueCount,
        activeRevenue,
        pastDueRevenue,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        packages,
        summary: {
          totalActiveCount,
          totalPastDueCount,
          totalActiveRevenue: Math.round(totalActiveRevenue * 100) / 100,
          totalPastDueRevenue: Math.round(totalPastDueRevenue * 100) / 100,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching membership by package:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch membership by package",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
