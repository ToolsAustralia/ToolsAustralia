import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";

/**
 * Debug endpoint to test the downgrade scheduling logic
 * This simulates what happens when Stripe sends webhook events
 */
export async function POST(request: NextRequest) {
  try {
    // Only allow in development
    if (process.env.NODE_ENV !== "development") {
      return NextResponse.json({ error: "Debug endpoints only available in development" }, { status: 403 });
    }

    const { email, simulateWebhookType } = await request.json();

    if (!email || !simulateWebhookType) {
      return NextResponse.json({ error: "Email and simulateWebhookType are required" }, { status: 400 });
    }

    await connectDB();

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    console.log(`🔧 DEBUG: Testing downgrade scheduling for user: ${email}`);
    console.log(`🔧 DEBUG: Simulating webhook type: ${simulateWebhookType}`);

    // Get current and target packages
    const currentPackage = getPackageById(user.subscription?.packageId || "");
    const targetPackage = getPackageById("foreman-subscription"); // Assume downgrade to Foreman

    if (!currentPackage || !targetPackage) {
      return NextResponse.json({ error: "Package not found" }, { status: 400 });
    }

    // Simulate different webhook scenarios
    let simulatedSubscription;
    
    if (simulateWebhookType === "scheduling_update") {
      // Simulate: Stripe sends webhook immediately after scheduling (items not changed yet)
      simulatedSubscription = {
        id: user.stripeSubscriptionId,
        status: "active",
        metadata: {
          downgradeScheduled: "true",
          downgradeTo: targetPackage._id,
          downgradeFrom: currentPackage._id,
          downgradeType: "scheduled",
        },
        items: {
          data: [
            {
              id: "si_test123",
              price: {
                id: currentPackage.stripePriceId, // Still current price (not changed yet)
              },
            },
          ],
        },
      };
    } else if (simulateWebhookType === "billing_cycle_change") {
      // Simulate: Stripe sends webhook when billing cycle actually changes (items changed)
      simulatedSubscription = {
        id: user.stripeSubscriptionId,
        status: "active",
        metadata: {
          downgradeScheduled: "true",
          downgradeTo: targetPackage._id,
          downgradeFrom: currentPackage._id,
          downgradeType: "scheduled",
        },
        items: {
          data: [
            {
              id: "si_test123",
              price: {
                id: targetPackage.stripePriceId, // Now target price (billing cycle changed)
              },
            },
          ],
        },
      };
    } else {
      return NextResponse.json({ error: "Invalid simulateWebhookType" }, { status: 400 });
    }

    // Test the webhook logic
    const isScheduledDowngrade =
      simulatedSubscription.metadata?.downgradeScheduled === "true" && 
      simulatedSubscription.metadata?.downgradeType === "scheduled";

    const currentPriceId = simulatedSubscription.items.data[0]?.price?.id;
    const targetStripePriceId = targetPackage.stripePriceId;
    const isActualBillingChange = currentPriceId === targetStripePriceId;

    const result = {
      user: {
        id: user._id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      },
      currentSubscription: {
        packageId: user.subscription?.packageId,
        packageName: currentPackage.name,
        stripePriceId: currentPackage.stripePriceId,
      },
      targetSubscription: {
        packageId: targetPackage._id,
        packageName: targetPackage.name,
        stripePriceId: targetPackage.stripePriceId,
      },
      simulatedWebhook: {
        type: simulateWebhookType,
        subscription: simulatedSubscription,
      },
      webhookLogic: {
        isScheduledDowngrade,
        currentPriceId,
        targetStripePriceId,
        isActualBillingChange,
        shouldProcessDowngrade: isScheduledDowngrade && isActualBillingChange,
      },
      expectedBehavior: {
        schedulingUpdate: {
          shouldProcess: false,
          reason: "Items haven't changed yet - just scheduling",
        },
        billingCycleChange: {
          shouldProcess: true,
          reason: "Items have changed - billing cycle processed",
        },
      },
    };

    return NextResponse.json({
      success: true,
      message: `Downgrade scheduling test completed for ${email}`,
      data: result,
    });
  } catch (error) {
    console.error("Debug downgrade scheduling test error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

