import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { protectDebugEndpoint } from "@/lib/debugAuth";

/**
 * DEBUG ONLY: Check current subscription status
 * GET /api/debug/subscription-status
 */
export async function GET() {
  try {
    // Protect debug endpoint
    const authResult = await protectDebugEndpoint();
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    await connectDB();

    // Get the user
    const user = await User.findById(authResult.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          stripeCustomerId: user.stripeCustomerId,
          stripeSubscriptionId: user.stripeSubscriptionId,
        },
        subscription: {
          packageId: user.subscription?.packageId,
          startDate: user.subscription?.startDate,
          endDate: user.subscription?.endDate,
          isActive: user.subscription?.isActive,
          autoRenew: user.subscription?.autoRenew,
          status: user.subscription?.status,
          pendingChange: user.subscription?.pendingChange,
        },
        hasPendingChange: !!user.subscription?.pendingChange,
        canDowngrade: !user.subscription?.pendingChange && user.subscription?.isActive,
        canUpgrade: !user.subscription?.pendingChange && user.subscription?.isActive,
        canCancel: user.subscription?.isActive,
      },
    });
  } catch (error) {
    console.error("❌ DEBUG: Error checking subscription status:", error);
    return NextResponse.json({ error: "Failed to check subscription status" }, { status: 500 });
  }
}
