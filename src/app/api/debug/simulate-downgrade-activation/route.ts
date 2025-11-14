import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";

/**
 * Debug endpoint to simulate downgrade activation
 * This allows us to test the downgrade flow without waiting for future dates
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

    // Check if user has a pending downgrade
    if (!user.subscription?.pendingChange || user.subscription.pendingChange.changeType !== "upgrade") {
      return NextResponse.json(
        {
          error: "No pending downgrade found",
          userSubscription: user.subscription,
        },
        { status: 400 }
      );
    }

    const pendingChange = user.subscription.pendingChange;
    console.log(`🔧 DEBUG: Simulating downgrade activation for user: ${email}`);
    console.log(`🔧 DEBUG: Pending change:`, pendingChange);

    // Get the new package
    const newPackage = getPackageById(pendingChange.newPackageId);
    if (!newPackage) {
      return NextResponse.json({ error: "Package not found" }, { status: 400 });
    }

    // Simulate webhook activation
    console.log(`🔧 DEBUG: Activating downgrade to ${newPackage.name}`);

    // Activate the pending change (simulate webhook)
    user.subscription.packageId = pendingChange.newPackageId;
    user.subscription.startDate = new Date();
    user.subscription.isActive = true;
    user.subscription.status = "active";
    user.subscription.autoRenew = true;
    user.subscription.pendingChange = undefined; // Clear pending change
    user.stripeSubscriptionId = pendingChange.stripeSubscriptionId || user.stripeSubscriptionId;

    // Save user
    await user.save();

    // Send Klaviyo event for downgrade activation
    try {
      const { createSubscriptionDowngradedEvent } = await import("@/utils/integrations/klaviyo/klaviyo-events");
      const { klaviyo } = await import("@/lib/klaviyo");

      const downgradeEvent = createSubscriptionDowngradedEvent(user, {
        fromPackageId: "previous-package",
        fromPackageName: "Previous Package",
        fromTier: "Previous Tier",
        fromPrice: 0,
        toPackageId: newPackage._id.toString(),
        toPackageName: newPackage.name,
        toTier: newPackage.name,
        toPrice: newPackage.price,
        effectiveDate: new Date(),
        daysUntilEffective: 0,
      });

      klaviyo.trackEventBackground(downgradeEvent);
      console.log(`✅ DEBUG: Klaviyo downgrade activation event sent`);
    } catch (klaviyoError) {
      console.log(`⚠️ DEBUG: Klaviyo downgrade event failed: ${klaviyoError}`);
    }

    return NextResponse.json({
      success: true,
      message: `Downgrade activation simulated successfully!`,
      data: {
        user: {
          id: user._id,
          email: user.email,
          subscription: {
            packageId: user.subscription?.packageId,
            packageName: newPackage.name,
            isActive: user.subscription?.isActive,
            status: user.subscription?.status,
            pendingChange: user.subscription?.pendingChange,
          },
        },
        activationDetails: {
          fromPackage: "Previous Package",
          toPackage: newPackage.name,
          effectiveDate: new Date().toISOString(),
          klaviyoEventSent: true,
        },
      },
    });
  } catch (error) {
    console.error("Debug downgrade activation error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
