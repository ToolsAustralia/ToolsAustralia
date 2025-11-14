import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";

/**
 * Debug endpoint to test the complete downgrade flow
 * This simulates a downgrade and checks if pendingChange is set correctly
 */
export async function POST(request: NextRequest) {
  try {
    // Only allow in development
    if (process.env.NODE_ENV !== "development") {
      return NextResponse.json({ error: "Debug endpoints only available in development" }, { status: 403 });
    }

    const { email, targetPackageId } = await request.json();

    if (!email || !targetPackageId) {
      return NextResponse.json({ error: "Email and targetPackageId are required" }, { status: 400 });
    }

    await connectDB();

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    console.log(`🔧 DEBUG: Testing downgrade flow for user: ${email}`);
    console.log(`🔧 DEBUG: Current package: ${user.subscription?.packageId}`);
    console.log(`🔧 DEBUG: Target package: ${targetPackageId}`);

    // Check if user has an active subscription
    if (!user.subscription?.isActive) {
      return NextResponse.json({ error: "User doesn't have an active subscription" }, { status: 400 });
    }

    // Get current and target packages
    const currentPackage = getPackageById(user.subscription.packageId);
    const targetPackage = getPackageById(targetPackageId);

    if (!currentPackage || !targetPackage) {
      return NextResponse.json({ error: "Package not found" }, { status: 400 });
    }

    // Simulate the downgrade logic (without actually calling the API)
    const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

    // This is what the downgrade API should do:
    const expectedPendingChange = {
      newPackageId: targetPackage._id,
      effectiveDate: currentPeriodEnd,
      changeType: "downgrade" as const,
      stripeSubscriptionId: user.stripeSubscriptionId,
      currentBenefits: {
        packageId: currentPackage._id,
        packageName: currentPackage.name,
        entriesPerMonth: currentPackage.entriesPerMonth || 0,
        discountPercentage: currentPackage.shopDiscountPercent || 0,
        price: currentPackage.price,
        benefits: currentPackage,
      },
    };

    const result = {
      user: {
        id: user._id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      },
      currentSubscription: {
        packageId: user.subscription.packageId,
        packageName: currentPackage.name,
        entriesPerMonth: currentPackage.entriesPerMonth,
        discountPercentage: currentPackage.shopDiscountPercent,
        price: currentPackage.price,
      },
      targetSubscription: {
        packageId: targetPackage._id,
        packageName: targetPackage.name,
        entriesPerMonth: targetPackage.entriesPerMonth,
        discountPercentage: targetPackage.shopDiscountPercent,
        price: targetPackage.price,
      },
      expectedDowngradeFlow: {
        pendingChange: expectedPendingChange,
        shouldPreserveBenefits: true,
        effectiveDate: currentPeriodEnd.toISOString(),
        daysUntilEffective: 30,
      },
      currentState: {
        hasPendingChange: !!user.subscription.pendingChange,
        pendingChangeDetails: user.subscription.pendingChange,
        lastDowngradeDate: user.subscription.lastDowngradeDate,
      },
      recommendations: {
        needsDowngrade: user.subscription.packageId !== targetPackageId,
        hasEmptyPendingChange:
          user.subscription.pendingChange && Object.keys(user.subscription.pendingChange).length === 0,
        shouldTestDowngradeAPI: true,
      },
    };

    return NextResponse.json({
      success: true,
      message: `Downgrade flow analysis completed for ${email}`,
      data: result,
    });
  } catch (error) {
    console.error("Debug downgrade flow test error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

