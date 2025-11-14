import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getEffectiveBenefits } from "@/utils/membership/benefit-resolution";

/**
 * Debug endpoint to test smart benefit resolution
 * This allows us to verify that users with pending downgrades get preserved benefits
 */
export async function GET(request: NextRequest) {
  try {
    // Only allow in development
    if (process.env.NODE_ENV !== "development") {
      return NextResponse.json({ error: "Debug endpoints only available in development" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ error: "Email parameter is required" }, { status: 400 });
    }

    await connectDB();

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    console.log(`🔧 DEBUG: Testing benefit resolution for user: ${email}`);
    console.log(`🔧 DEBUG: User subscription:`, JSON.stringify(user.subscription, null, 2));

    // Test smart benefit resolution
    const effectiveBenefits = getEffectiveBenefits(user);

    const result = {
      user: {
        id: user._id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      },
      subscription: {
        packageId: user.subscription?.packageId,
        isActive: user.subscription?.isActive,
        status: user.subscription?.status,
        pendingChange: user.subscription?.pendingChange,
      },
      smartBenefitResolution: {
        effectiveBenefits: effectiveBenefits,
        preservedDuringDowngrade: effectiveBenefits?.packageId !== user.subscription?.packageId,
        effectivePackageName: effectiveBenefits?.packageName,
        effectivePackageId: effectiveBenefits?.packageId,
        entriesPerMonth: effectiveBenefits?.entriesPerMonth,
        discountPercentage: effectiveBenefits?.discountPercentage,
      },
      testResults: {
        hasPendingDowngrade: user.subscription?.pendingChange?.changeType === "upgrade",
        shouldPreserveBenefits: false, // pendingChange is only for upgrades, not downgrades
        currentPackageId: user.subscription?.packageId,
        effectivePackageId: effectiveBenefits?.packageId,
        benefitsMatch: user.subscription?.packageId === effectiveBenefits?.packageId,
      },
    };

    return NextResponse.json({
      success: true,
      message: `Benefit resolution test completed for ${email}`,
      data: result,
    });
  } catch (error) {
    console.error("Debug benefit resolution test error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

