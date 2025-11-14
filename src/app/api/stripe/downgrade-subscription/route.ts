import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import Stripe from "stripe";

// Extended Stripe subscription interface to include current_period_end
interface StripeSubscriptionWithPeriodEnd extends Stripe.Subscription {
  current_period_end: number;
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    console.log(`🚀 Downgrading subscription for user: ${body.userId || "unknown"}`);
    const { newPackageId } = body;

    // Validate required fields
    if (!newPackageId) {
      return NextResponse.json({ error: "New package ID is required" }, { status: 400 });
    }

    // Get user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Connect to database
    await connectDB();

    // Find user
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    console.log(`🔍 DEBUG: Checking pending change for user: ${session.user.email}`);
    console.log(`🔍 DEBUG: User subscription:`, {
      pendingChange: user.subscription?.pendingChange || {},
      packageId: user.subscription?.packageId,
      startDate: user.subscription?.startDate,
      isActive: user.subscription?.isActive,
      autoRenew: user.subscription?.autoRenew,
      status: user.subscription?.status,
    });

    // Check if pendingChange is empty object
    const hasEmptyPendingChange =
      user.subscription?.pendingChange && Object.keys(user.subscription.pendingChange).length === 0;
    console.log(`🔍 DEBUG: Has empty pendingChange: ${hasEmptyPendingChange}`);
    console.log(
      `🔍 DEBUG: pendingChange keys: ${
        user.subscription?.pendingChange ? Object.keys(user.subscription.pendingChange) : "none"
      }`
    );

    // Check if user has pending changes (only block if there are actual pending changes)
    if (
      user.subscription?.pendingChange &&
      !hasEmptyPendingChange &&
      user.subscription.pendingChange.newPackageId &&
      user.subscription.pendingChange.changeType
    ) {
      const pendingChange = user.subscription.pendingChange;
      console.log(`⚠️ User already has pending changes:`, pendingChange);
      return NextResponse.json(
        {
          error: "You already have a pending upgrade. Please complete or cancel it before downgrading.",
          pendingChange: {
            newPackageId: pendingChange.newPackageId,
            changeType: pendingChange.changeType,
          },
        },
        { status: 400 }
      );
    }

    console.log(`✅ DEBUG: No pending change found, proceeding with downgrade`);

    // Validate user has active subscription
    if (!user.subscription?.isActive || !user.stripeSubscriptionId) {
      return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
    }

    // Get current and target packages
    const currentPackageId = user.subscription.packageId;
    const currentPackage = getPackageById(currentPackageId);
    const newPackage = getPackageById(newPackageId);

    if (!currentPackage || !newPackage) {
      return NextResponse.json({ error: "Invalid package configuration" }, { status: 400 });
    }

    // Validate this is actually a downgrade
    if (newPackage.price >= currentPackage.price) {
      return NextResponse.json({ error: "This is not a valid downgrade" }, { status: 400 });
    }

    console.log(
      `📊 Downgrading from ${currentPackage.name} ($${currentPackage.price}) to ${newPackage.name} ($${newPackage.price})`
    );

    // Get current subscription from Stripe
    const subscription = (await stripe.subscriptions.retrieve(
      user.stripeSubscriptionId
    )) as unknown as StripeSubscriptionWithPeriodEnd;

    // Validate subscription has current_period_end or calculate fallback
    let currentPeriodEnd: number;
    if (subscription.current_period_end) {
      currentPeriodEnd = subscription.current_period_end;
      console.log(`📅 Current subscription period ends: ${new Date(currentPeriodEnd * 1000).toISOString()}`);
    } else {
      console.error(`❌ Invalid current_period_end from Stripe:`, subscription.current_period_end);
      console.log(`🔧 FALLBACK: Calculating period end from subscription start date`);

      // Calculate fallback: subscription start date + 30 days
      const subscriptionStartDate = user.subscription?.startDate;
      if (!subscriptionStartDate) {
        return NextResponse.json(
          { error: "Unable to determine subscription billing cycle. Please contact support." },
          { status: 400 }
        );
      }

      const fallbackEndDate = new Date(subscriptionStartDate);
      fallbackEndDate.setDate(fallbackEndDate.getDate() + 30);
      currentPeriodEnd = Math.floor(fallbackEndDate.getTime() / 1000);

      console.log(`📅 Using fallback period end: ${fallbackEndDate.toISOString()}`);
    }

    // ✅ STRIPE BEST PRACTICE: Use existing Product/Price IDs from membership package
    // This prevents creating duplicate products in Stripe dashboard
    console.log(`✅ Using existing Stripe Price ID for ${newPackage.name}`);

    if (!newPackage.stripePriceId) {
      console.error(`❌ No Stripe Price ID configured for package: ${newPackage.name}`);
      return NextResponse.json(
        {
          success: false,
          error: `Stripe configuration missing for ${newPackage.name}. Please contact support.`,
        },
        { status: 500 }
      );
    }

    const stripePriceId = newPackage.stripePriceId;
    console.log(`💰 Using Stripe Price: ${stripePriceId} ($${newPackage.price}/month)`);

    // 🎯 NEW APPROACH: Update Stripe subscription IMMEDIATELY with new price
    // User will be charged new (lower) price at next billing cycle
    // But we preserve old benefits until that date using previousSubscription
    console.log(`🎯 NEW APPROACH: Update Stripe immediately, preserve benefits with previousSubscription`);

    // 🎯 CRITICAL FIX: Replace subscription items instead of adding to them
    // Get current subscription items to replace them
    const currentSubscriptionItems = subscription.items.data;

    console.log(
      `🔍 Current subscription items:`,
      currentSubscriptionItems.map((item: Stripe.SubscriptionItem) => ({
        id: item.id,
        price: item.price.id,
        product: item.price.product,
      }))
    );

    // Create subscription update with item replacements
    const subscriptionUpdateParams: Stripe.SubscriptionUpdateParams = {
      items: currentSubscriptionItems.map((item: Stripe.SubscriptionItem) => ({
        id: item.id,
        deleted: true, // Delete old items
      })),
      proration_behavior: "none", // No immediate charge - user pays current price until cycle ends
      billing_cycle_anchor: "unchanged", // Keep current billing cycle - new price at next cycle
      metadata: {
        userId: user._id.toString(),
        userEmail: user.email,
        packageId: newPackage._id, // NEW package (Stripe subscription updated immediately)
        packageName: newPackage.name,
        downgradedFrom: currentPackage._id, // For audit trail
        downgradeDate: new Date().toISOString(),
      },
    };

    // Add new item
    subscriptionUpdateParams.items = [
      ...(subscriptionUpdateParams.items || []),
      {
        price: stripePriceId, // ✅ Use existing Price ID
        quantity: 1,
      },
    ];

    await stripe.subscriptions.update(user.stripeSubscriptionId, subscriptionUpdateParams);

    console.log(`✅ Stripe subscription updated successfully - new price takes effect at next billing cycle`);
    console.log(`📅 Current billing cycle ends: ${new Date(currentPeriodEnd * 1000).toISOString()}`);

    // 🎯 KEY: Store previous subscription for benefit preservation
    // User keeps OLD package benefits until original billing cycle ends
    const effectiveDate = new Date(currentPeriodEnd * 1000);

    user.subscription.previousSubscription = {
      packageId: currentPackage._id,
      packageName: currentPackage.name,
      benefits: {
        entriesPerMonth: currentPackage.entriesPerMonth || 0,
        discountPercentage: currentPackage.shopDiscountPercent || 0,
      },
      startDate: user.subscription.startDate,
      endDate: effectiveDate,
      downgradeDate: new Date(),
    };

    // Track downgrade date for security (prevent gaming)
    user.subscription.lastDowngradeDate = new Date();

    // 🎯 UPDATE: Set current subscription to new (downgraded) package
    // previousSubscription handles preserving old benefits until endDate
    user.subscription.packageId = newPackage._id;
    user.subscription.startDate = new Date(); // New subscription starts now (in Stripe)

    await user.save();

    // ✅ NEW: Track pixel subscription downgrade event
    try {
      const { trackPixelSubscriptionDowngrade } = await import("@/utils/tracking/pixel-purchase-tracking");
      await trackPixelSubscriptionDowngrade({
        oldValue: currentPackage.price,
        newValue: newPackage.price,
        currency: "AUD",
        oldPackageId: currentPackage._id,
        newPackageId: newPackage._id,
        oldPackageName: currentPackage.name,
        newPackageName: newPackage.name,
        subscriptionId: user.stripeSubscriptionId,
        userId: user._id.toString(),
        userEmail: user.email,
        prorationAmount: 0, // No immediate charge for downgrade
        entriesRemoved: (currentPackage.entriesPerMonth || 0) - (newPackage.entriesPerMonth || 0),
      });
      console.log(`📊 Pixel subscription downgrade tracked: ${currentPackage.name} → ${newPackage.name}`);
    } catch (pixelError) {
      console.error("❌ Pixel downgrade tracking failed (non-blocking):", pixelError);
    }

    console.log(`✅ User subscription updated to ${newPackage.name} (current package)`);

    console.log(
      `✅ Previous subscription saved - user keeps ${currentPackage.name} benefits until ${effectiveDate.toISOString()}`
    );
    console.log(
      `🎯 User will see ${newPackage.name} in Stripe, but gets ${currentPackage.name} benefits until end date`
    );

    // Update Stripe customer metadata
    if (user.stripeCustomerId) {
      await stripe.customers.update(user.stripeCustomerId, {
        metadata: {
          currentPackage: newPackage._id, // Matches Stripe subscription
          previousPackage: currentPackage._id,
          previousPackageEndDate: effectiveDate.toISOString(),
          downgradeDate: new Date().toISOString(),
        },
      });
    }

    // Send Klaviyo downgrade scheduled event
    try {
      const { createSubscriptionDowngradedEvent } = await import("@/utils/integrations/klaviyo/klaviyo-events");
      const { klaviyo } = await import("@/lib/klaviyo");

      const downgradeEvent = createSubscriptionDowngradedEvent(user, {
        fromPackageId: currentPackage._id,
        fromPackageName: currentPackage.name,
        fromTier: currentPackage.name,
        fromPrice: currentPackage.price,
        toPackageId: newPackage._id,
        toPackageName: newPackage.name,
        toTier: newPackage.name,
        toPrice: newPackage.price,
        effectiveDate: effectiveDate,
        daysUntilEffective: Math.ceil((effectiveDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      });

      klaviyo.trackEventBackground(downgradeEvent);
      console.log(`✅ Klaviyo downgrade scheduled event sent for user: ${user._id}`);
    } catch (klaviyoError) {
      console.log(`⚠️ Klaviyo downgrade event failed: ${klaviyoError}`);
    }

    // Security audit trail
    console.log(`🔒 SECURITY: Downgrade scheduled with audit trail:`, {
      userId: user._id,
      email: user.email,
      fromPackage: currentPackage.name,
      toPackage: newPackage.name,
      effectiveDate: effectiveDate.toISOString(),
      subscriptionId: user.stripeSubscriptionId,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: `Downgrade scheduled successfully. You'll keep ${currentPackage.name} benefits until your next billing cycle.`,
      data: {
        previousPackage: {
          id: currentPackage._id,
          name: currentPackage.name,
          price: currentPackage.price,
          benefitsUntil: effectiveDate.toISOString(),
        },
        newPackage: {
          id: newPackage._id,
          name: newPackage.name,
          price: newPackage.price,
          activatesOn: effectiveDate.toISOString(),
        },
        benefitsPreserved: true,
        daysUntilChange: Math.ceil((effectiveDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      },
    });
  } catch (error) {
    console.error("Downgrade subscription error:", error);
    return NextResponse.json(
      {
        error: "Failed to downgrade subscription. Please try again.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
