import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import {
  getCurrentUserBenefits,
  getAvailableUpgrades,
  getAvailableDowngrades,
  getPendingChangeMessage,
} from "@/utils/membership/subscription-benefits";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * GET /api/subscription/benefits
 * Get current user subscription benefits and available changes
 */
export async function GET(_request: NextRequest) {
  try {
    await connectDB();

    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Get the user
    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get current benefits
    const currentBenefits = getCurrentUserBenefits(user);

    // Get available upgrades and downgrades
    const availableUpgrades = getAvailableUpgrades(user);
    const availableDowngrades = getAvailableDowngrades(user);

    // Get pending change message
    const pendingChangeMessage = getPendingChangeMessage(user);

    // Check if subscription is cancelled (autoRenew is false but still active)
    const isCancelled = !user.subscription?.autoRenew && user.subscription?.isActive;
    const endDate = user.subscription?.endDate;

    return NextResponse.json({
      success: true,
      data: {
        currentBenefits,
        availableUpgrades,
        availableDowngrades,
        pendingChangeMessage,
        hasActiveSubscription: !!user.subscription?.isActive,
        subscriptionStatus: user.subscription?.status,
        autoRenew: user.subscription?.autoRenew,
        nextBillingDate: user.subscription?.endDate,
        isCancelled,
        endDate,
      },
    });
  } catch (error) {
    console.error("Get subscription benefits error:", error);
    return NextResponse.json({ error: "Failed to get subscription benefits. Please try again." }, { status: 500 });
  }
}
