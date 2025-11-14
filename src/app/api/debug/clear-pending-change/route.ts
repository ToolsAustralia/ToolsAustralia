import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { protectDebugEndpoint } from "@/lib/debugAuth";

/**
 * DEBUG ONLY: Clear pending subscription changes for testing
 * POST /api/debug/clear-pending-change
 */
export async function POST() {
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

    console.log(`🔧 DEBUG: Clearing pending change for user: ${user.email}`);
    console.log(`🔧 Current pending change:`, user.subscription?.pendingChange);

    // Clear any pending changes
    if (user.subscription?.pendingChange) {
      user.subscription.pendingChange = undefined;
      await user.save();
      console.log(`✅ DEBUG: Cleared pending change for user: ${user.email}`);
    }

    return NextResponse.json({
      success: true,
      message: "Pending changes cleared (DEBUG ONLY)",
      data: {
        hadPendingChange: !!user.subscription?.pendingChange,
        subscription: {
          packageId: user.subscription?.packageId,
          isActive: user.subscription?.isActive,
          autoRenew: user.subscription?.autoRenew,
          status: user.subscription?.status,
          pendingChange: user.subscription?.pendingChange,
        },
      },
    });
  } catch (error) {
    console.error("❌ DEBUG: Error clearing pending changes:", error);
    return NextResponse.json({ error: "Failed to clear pending changes" }, { status: 500 });
  }
}
