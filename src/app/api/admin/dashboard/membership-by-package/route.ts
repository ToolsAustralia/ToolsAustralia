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
 * Get membership counts per subscription package (active vs cancelled)
 *
 * Returns:
 * - packages: [{ packageId, packageName, activeCount, cancelledCount }]
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

    const [activeResults, cancelledResults] = await Promise.all([
      User.aggregate([
        { $match: { ...baseMatch, ...getActiveSubscriptionFilter(false) } },
        { $group: { _id: "$subscription.packageId", count: { $sum: 1 } } },
      ]),
      User.aggregate([
        {
          $match: {
            ...baseMatch,
            "subscription.endDate": { $exists: true, $ne: null },
            "subscription.autoRenew": false,
            "subscription.status": { $in: ["active", "past_due"] },
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

    const packages = SUBSCRIPTION_PACKAGE_IDS.map((packageId) => {
      const pkg = getPackageById(packageId);
      return {
        packageId,
        packageName: pkg?.name ?? packageId,
        activeCount: activeByPackage[packageId] ?? 0,
        cancelledCount: cancelledByPackage[packageId] ?? 0,
      };
    });

    return NextResponse.json({
      success: true,
      data: { packages },
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
