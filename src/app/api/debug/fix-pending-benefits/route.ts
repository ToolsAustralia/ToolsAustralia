import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";

/**
 * Debug endpoint to check pending downgrades (currentBenefits no longer needed with Subscription Schedules)
 * This endpoint is now informational since Subscription Schedules handle benefit preservation automatically
 */
export async function POST(request: NextRequest) {
  try {
    // Only allow in development
    if (process.env.NODE_ENV !== "development") {
      return NextResponse.json({ error: "Debug endpoints only available in development" }, { status: 403 });
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    await connectDB();

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 🎯 NEW APPROACH: Check for previousSubscription instead of pendingChange
    if (!user.subscription?.previousSubscription) {
      return NextResponse.json(
        {
          error: "User doesn't have preserved benefits from a downgrade",
          userSubscription: user.subscription,
        },
        { status: 400 }
      );
    }

    console.log(`🔧 DEBUG: Checking preserved benefits for user: ${email}`);
    console.log(`🔧 DEBUG: Current packageId: ${user.subscription.packageId}`);
    console.log(`🔧 DEBUG: Previous packageId: ${user.subscription.previousSubscription.packageId}`);

    // Get current package info for display
    const currentPackage = getPackageById(user.subscription.packageId);
    const previousPackage = getPackageById(user.subscription.previousSubscription.packageId);

    if (!currentPackage || !previousPackage) {
      return NextResponse.json({ error: "Package not found" }, { status: 400 });
    }

    const now = new Date();
    const endDate = new Date(user.subscription.previousSubscription.endDate);
    const isActive = now < endDate;

    return NextResponse.json({
      success: true,
      message: `User has ${isActive ? "ACTIVE" : "EXPIRED"} preserved benefits from previous subscription`,
      data: {
        user: {
          id: user._id,
          email: user.email,
        },
        currentSubscription: {
          packageId: user.subscription.packageId,
          packageName: currentPackage.name,
          entriesPerMonth: currentPackage.entriesPerMonth,
          discountPercentage: currentPackage.shopDiscountPercent,
        },
        previousSubscription: {
          packageId: user.subscription.previousSubscription.packageId,
          packageName: user.subscription.previousSubscription.packageName,
          entriesPerMonth: user.subscription.previousSubscription.benefits.entriesPerMonth,
          discountPercentage: user.subscription.previousSubscription.benefits.discountPercentage,
          endDate: user.subscription.previousSubscription.endDate,
          downgradeDate: user.subscription.previousSubscription.downgradeDate,
        },
        benefitsStatus: {
          isActive,
          daysRemaining: isActive ? Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0,
          effectiveBenefits: isActive ? "Previous (higher tier)" : "Current (downgraded)",
        },
        note: "🎯 NEW APPROACH: previousSubscription preserves benefits until endDate. Stripe subscription is already updated to new tier.",
      },
    });
  } catch (error) {
    console.error("Debug fix pending benefits error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
