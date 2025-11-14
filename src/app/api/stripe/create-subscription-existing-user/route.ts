import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { stripe } from "@/lib/stripe";
import { recordReferralPurchase } from "@/lib/referral";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
// Klaviyo integration handled by webhook for best practices

const createSubscriptionExistingUserSchema = z.object({
  packageId: z.string().min(1, "Package ID is required"),
  paymentMethodId: z.string().min(1, "Payment method is required"),
  referralCode: z.string().optional(),
});

/**
 * POST /api/stripe/create-subscription-existing-user
 * Create a new Stripe subscription for an existing logged-in user
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createSubscriptionExistingUserSchema.parse(body);

    console.log(`🚀 Creating subscription for existing user: ${session.user.id}`);

    // Get the existing user
    const existingUser = await User.findById(session.user.id);
    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user already has an active subscription
    if (existingUser.subscription?.isActive) {
      return NextResponse.json(
        {
          error:
            "User already has an active subscription. Please manage your existing subscription instead of creating a new one.",
          code: "EXISTING_SUBSCRIPTION",
        },
        { status: 409 }
      );
    }

    // Get the membership package
    const membershipPackage = getPackageById(validatedData.packageId);
    if (!membershipPackage || !membershipPackage.isActive) {
      return NextResponse.json({ error: "Invalid or inactive package" }, { status: 400 });
    }

    // Create or retrieve Stripe customer
    let stripeCustomerId = existingUser.stripeCustomerId;
    if (!stripeCustomerId) {
      console.log("Creating new Stripe customer for existing user");
      const customer = await stripe.customers.create({
        email: existingUser.email,
        name: `${existingUser.firstName} ${existingUser.lastName}`,
        phone: existingUser.mobile || undefined,
      });
      stripeCustomerId = customer.id;

      // Update user with Stripe customer ID
      existingUser.stripeCustomerId = stripeCustomerId;
      await existingUser.save();
    }

    // Handle payment method creation following Stripe best practices
    const finalPaymentMethodId = validatedData.paymentMethodId;

    // Payment method should already be created via SetupIntent
    // If we receive "new_payment_method", it means the frontend didn't complete the setup
    if (validatedData.paymentMethodId === "new_payment_method") {
      return NextResponse.json(
        {
          success: false,
          error: "Payment method not properly set up. Please complete card details first.",
        },
        { status: 400 }
      );
    }

    // If we have a valid payment method ID, attach it to the customer
    if (finalPaymentMethodId && finalPaymentMethodId !== "new_payment_method") {
      // Attach to customer
      await stripe.paymentMethods.attach(finalPaymentMethodId, {
        customer: stripeCustomerId,
      });
      console.log(`💳 Attached payment method: ${finalPaymentMethodId}`);

      // Set as default payment method for the customer
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: {
          default_payment_method: finalPaymentMethodId,
        },
      });
      console.log(`💳 Set ${finalPaymentMethodId} as default payment method for customer ${stripeCustomerId}`);
    }

    // ✅ STRIPE BEST PRACTICE: Use existing Product/Price IDs from membership package
    // This prevents creating duplicate products in Stripe dashboard
    console.log(`✅ Using existing Stripe Price ID for ${membershipPackage.name}`);

    if (!membershipPackage.stripePriceId) {
      console.error(`❌ No Stripe Price ID configured for package: ${membershipPackage.name}`);
      return NextResponse.json(
        {
          success: false,
          error: `Stripe configuration missing for ${membershipPackage.name}. Please contact support.`,
        },
        { status: 500 }
      );
    }

    const stripePriceId = membershipPackage.stripePriceId;
    console.log(`💰 Using Stripe Price: ${stripePriceId} ($${membershipPackage.price}/month)`);

    // Create the subscription with metadata for webhook processing
    // Use payment_behavior to match new user flow and ensure proper webhook processing
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: stripePriceId }], // ✅ Use existing Price ID
      default_payment_method: finalPaymentMethodId,
      payment_behavior: "default_incomplete", // Creates incomplete subscription requiring payment confirmation
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      description: `${membershipPackage.name}`, // Set description directly on subscription
      metadata: {
        packageId: validatedData.packageId,
        packageName: membershipPackage.name,
        userEmail: existingUser.email,
      },
    });

    // Update user subscription info immediately but NO initial benefit allocation
    console.log(
      `📝 Saving subscription to user database: packageId=${membershipPackage._id}, subscriptionId=${subscription.id}`
    );
    existingUser.subscription = {
      packageId: membershipPackage._id,
      pendingChange: undefined, // Initialize pendingChange field for subscription management
      isActive: subscription.status === "active", // ✅ Set based on Stripe subscription status
      startDate: new Date(),
      endDate: undefined, // Subscription doesn't have an end date
      autoRenew: true,
      status: subscription.status, // Track subscription status
    };

    existingUser.stripeSubscriptionId = subscription.id;

    // Ensure the save completes before responding (critical for webhook processing)
    await existingUser.save();
    console.log(`✅ User subscription saved to database: packageId=${existingUser.subscription.packageId}`);

    // ✅ Klaviyo integration handled by webhook for reliability and best practices
    console.log(`📊 Klaviyo events will be tracked via webhook when payment is confirmed`);

    console.log(`✅ Subscription created successfully for user: ${existingUser.email}`);
    console.log(`📦 Package: ${membershipPackage.name} ($${membershipPackage.price})`);
    console.log(`⏳ Entries/points will be added via webhook upon first payment confirmation`);
    console.log(`🔒 Subscription status: ${subscription.status} - benefits will activate on payment`);

    if (validatedData.referralCode) {
      try {
        await recordReferralPurchase({
          referralCode: validatedData.referralCode,
          inviteeUserId: existingUser._id.toString(),
          inviteeEmail: existingUser.email,
          inviteeName: `${existingUser.firstName} ${existingUser.lastName}`.trim(),
          qualifyingOrderId: subscription.id,
          qualifyingOrderType: "membership",
        });
      } catch (referralError) {
        console.error("Referral purchase capture failed:", referralError);
      }
    }

    return NextResponse.json({
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        clientSecret:
          typeof subscription.latest_invoice === "object" && subscription.latest_invoice !== null
            ? (subscription.latest_invoice as { payment_intent?: { client_secret?: string } }).payment_intent
                ?.client_secret
            : undefined,
      },
      user: {
        id: existingUser._id,
        email: existingUser.email,
        subscription: existingUser.subscription,
        oneTimePackages: existingUser.oneTimePackages,
        entryWallet: existingUser.entryWallet,
        accumulatedEntries: existingUser.accumulatedEntries,
        rewardsPoints: existingUser.rewardsPoints,
      },
    });
  } catch (error) {
    console.error("❌ Subscription creation failed:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.issues }, { status: 400 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: "Failed to create subscription", details: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }
}
