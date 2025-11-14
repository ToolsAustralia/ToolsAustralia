import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";

/**
 * Debug endpoint to check pending downgrades
 * Shows all users with pending downgrades and their details
 */
export async function GET() {
  try {
    // Only allow in development
    if (process.env.NODE_ENV !== "development") {
      return NextResponse.json({ error: "Debug endpoints only available in development" }, { status: 403 });
    }

    await connectDB();

    // Find all users with pending downgrades
    const usersWithPendingDowngrades = await User.find({
      "subscription.pendingChange.changeType": "downgrade",
    });

    const downgradeDetails = usersWithPendingDowngrades.map((user) => {
      const pendingChange = user.subscription?.pendingChange;
      const currentPackage = getPackageById(user.subscription?.packageId || "");
      const newPackage = getPackageById(pendingChange?.newPackageId || "");

      return {
        user: {
          id: user._id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
        },
        currentSubscription: {
          packageId: user.subscription?.packageId,
          packageName: currentPackage?.name || "Unknown",
          isActive: user.subscription?.isActive,
          status: user.subscription?.status,
          startDate: user.subscription?.startDate,
        },
        pendingDowngrade: {
          newPackageId: pendingChange?.newPackageId,
          newPackageName: newPackage?.name || "Unknown",
          stripeSubscriptionId: pendingChange?.stripeSubscriptionId,
          changeType: pendingChange?.changeType,
          upgradeAmount: pendingChange?.upgradeAmount,
        },
        lastDowngradeDate: user.subscription?.lastDowngradeDate,
      };
    });

    return NextResponse.json({
      success: true,
      count: downgradeDetails.length,
      pendingDowngrades: downgradeDetails,
    });
  } catch (error) {
    console.error("Debug check pending downgrades error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
