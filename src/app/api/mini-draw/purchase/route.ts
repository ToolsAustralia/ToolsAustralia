import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import MiniDraw from "@/models/MiniDraw";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";
import { stripe } from "@/lib/stripe";
// Benefits are now granted via webhook processing only

const miniDrawPurchaseSchema = z.object({
  packageId: z.string().min(1, "Package ID is required"),
  miniDrawId: z.string().min(1, "Mini Draw ID is required"),
  useDefaultPayment: z.boolean().default(false),
  paymentMethodId: z.string().optional(),
});

/**
 * ✅ WEBHOOK-ONLY ENTRY GRANTING
 *
 * This API route ONLY creates payment intents and returns payment status.
 * NO entries are granted here - all entry granting happens via webhook.
 *
 * Flow:
 * 1. This API creates payment intent with metadata (including miniDrawId)
 * 2. Stripe sends payment_intent.succeeded webhook when payment succeeds
 * 3. Webhook handler (src/app/api/stripe/webhook/route.ts) calls handleMiniDrawWebhook
 * 4. handleMiniDrawWebhook calls processPaymentBenefits → grantBenefits → addToMiniDraw
 * 5. addToMiniDraw is the ONLY function that grants entries to MiniDraw model
 *
 * This ensures:
 * - Single source of truth (webhook)
 * - Idempotency (PaymentEvent prevents duplicates)
 * - Reliability (webhook retries on failure)
 * - No race conditions (atomic database operations)
 */

/**
 * POST /api/mini-draw/purchase
 * Handle mini draw package purchases
 */
export async function POST(request: NextRequest) {
  try {
    console.log("🎯 Mini draw purchase request received");

    // Parse and validate request body
    const body = await request.json();
    const validatedData = miniDrawPurchaseSchema.parse(body);

    console.log("✅ Request validation successful:", validatedData);

    // Get user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required",
        },
        { status: 401 }
      );
    }

    // Connect to database
    await connectDB();

    // Get user
    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "User not found",
        },
        { status: 404 }
      );
    }

    // Check if user is a member (has active subscription or one-time packages)
    const hasActiveMembership = user.subscription?.isActive === true;

    if (!hasActiveMembership) {
      return NextResponse.json(
        {
          success: false,
          error: "An active membership is required to purchase mini draw packages",
        },
        { status: 403 }
      );
    }

    // Create or retrieve Stripe customer ID
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      console.log("👤 Creating new Stripe customer for mini draw purchase");
      try {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          phone: user.mobile || undefined,
          metadata: {
            userId: user._id.toString(),
            source: "mini-draw-purchase",
          },
        });
        stripeCustomerId = customer.id;

        // Update user with Stripe customer ID
        user.stripeCustomerId = stripeCustomerId;
        await user.save();
        console.log(`✅ Created and saved Stripe customer: ${stripeCustomerId}`);
      } catch (stripeError) {
        console.error("❌ Stripe customer creation failed:", stripeError);
        return NextResponse.json(
          {
            success: false,
            error: "Failed to create Stripe customer",
            details: stripeError instanceof Error ? stripeError.message : "Unknown error",
          },
          { status: 500 }
        );
      }
    } else {
      console.log(`👤 Using existing Stripe customer: ${stripeCustomerId}`);
    }

    // Validate MiniDraw exists and is accepting entries
    const miniDraw = await MiniDraw.findById(validatedData.miniDrawId);
    if (!miniDraw) {
      return NextResponse.json(
        {
          success: false,
          error: "Mini draw not found",
        },
        { status: 404 }
      );
    }

    // Validate MiniDraw is in a valid state to accept entries
    const now = new Date();
    if (miniDraw.status === "completed" || miniDraw.status === "cancelled") {
      return NextResponse.json(
        {
          success: false,
          error: `Mini draw "${miniDraw.name}" is ${miniDraw.status} and cannot accept new entries`,
        },
        { status: 400 }
      );
    }

    // Validate draw is active or queued
    if (miniDraw.status !== "active") {
      return NextResponse.json(
        {
          success: false,
          error: `Mini draw "${miniDraw.name}" is in ${miniDraw.status} status and cannot accept entries`,
        },
        { status: 400 }
      );
    }

    // Check if minimum entries has been reached
    if (miniDraw.totalEntries >= miniDraw.minimumEntries) {
      return NextResponse.json(
        {
          success: false,
          error: `Mini draw "${miniDraw.name}" has reached its minimum entries limit (${miniDraw.minimumEntries}) and is now closed`,
        },
        { status: 400 }
      );
    }

    // Get mini draw package
    const miniDrawPackage = getMiniDrawPackageById(validatedData.packageId);
    if (!miniDrawPackage) {
      return NextResponse.json(
        {
          success: false,
          error: "Mini draw package not found",
        },
        { status: 404 }
      );
    }

    const remainingEntries = Math.max(miniDraw.minimumEntries - miniDraw.totalEntries, 0);
    if (miniDrawPackage.entries > remainingEntries) {
      return NextResponse.json(
        {
          success: false,
          error: `Mini draw "${miniDraw.name}" only has ${remainingEntries} entries remaining`,
        },
        { status: 400 }
      );
    }

    console.log("📦 Processing mini draw package:", miniDrawPackage.name);
    console.log("🎲 For MiniDraw:", miniDraw.name, `(${validatedData.miniDrawId})`);
    console.log("🔍 User details:", {
      userId: user._id,
      stripeCustomerId: user.stripeCustomerId,
      hasStripeCustomerId: !!user.stripeCustomerId,
    });
    console.log("🔍 Payment details:", {
      useDefaultPayment: validatedData.useDefaultPayment,
      paymentMethodId: validatedData.paymentMethodId,
    });

    // Handle payment method and create payment intent
    if (validatedData.useDefaultPayment && validatedData.paymentMethodId) {
      if (!user.stripeCustomerId) {
        throw new Error("No Stripe customer ID found for user");
      }
      console.log("🚀 Calling handleOneClickPurchase");
      return await handleOneClickPurchase(
        user as unknown as Parameters<typeof handleOneClickPurchase>[0],
        miniDrawPackage,
        validatedData.miniDrawId,
        validatedData.paymentMethodId
      );
    } else {
      if (!user.stripeCustomerId) {
        throw new Error("No Stripe customer ID found for user");
      }
      console.log("🚀 Calling handlePaymentIntentCreation");
      return await handlePaymentIntentCreation(
        user,
        miniDrawPackage,
        validatedData.miniDrawId,
        validatedData.paymentMethodId
      );
    }
  } catch (error) {
    console.error("❌ Mini draw purchase failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Mini draw purchase failed",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle one-click purchase using default payment method
 */
async function handleOneClickPurchase(
  user: {
    _id: string;
    stripeCustomerId?: string;
    entryWallet?: number;
    accumulatedEntries?: number;
    oneTimePackages?: Array<{
      packageId: string;
      packageName: string;
      packageType: string;
      price: number;
      entries: number;
      partnerDiscountHours: number;
      partnerDiscountDays: number;
      purchaseDate: Date;
      isActive: boolean;
      stripePaymentIntentId: string;
    }>;
    totalSpent?: number;
    save: () => Promise<void>;
  },
  miniDrawPackage: {
    _id: string;
    name: string;
    price: number;
    entries: number;
    partnerDiscountHours: number;
    partnerDiscountDays: number;
  },
  miniDrawId: string,
  paymentMethodId: string
) {
  try {
    console.log("🎯 handleOneClickPurchase called with:", {
      userId: user._id,
      packageName: miniDrawPackage.name,
      packagePrice: miniDrawPackage.price,
      paymentMethodId,
    });

    if (!paymentMethodId) {
      console.log("❌ No payment method ID provided");
      return NextResponse.json(
        {
          success: false,
          error: "Payment method ID is required",
        },
        { status: 400 }
      );
    }

    // Handle payment method creation/attachment (same pattern as upsell API)
    let finalPaymentMethodId = paymentMethodId;

    // For development OR reuse prevention - create new payment method
    if (paymentMethodId === "pm_card_visa" || !paymentMethodId.startsWith("pm_")) {
      console.log(`🔄 Creating fresh payment method for mini draw (reuse pattern)`);

      try {
        // Create a new test/card payment method for this customer
        const newPaymentMethod = await stripe.paymentMethods.create({
          type: "card",
          card: {
            token: "tok_visa", // Use Stripe's test token (works in test mode)
          },
        });

        // Attach to customer immediately
        await stripe.paymentMethods.attach(newPaymentMethod.id, {
          customer: user.stripeCustomerId!,
        });

        // Verify attachment
        const verifiedPaymentMethod = await stripe.paymentMethods.retrieve(newPaymentMethod.id);
        if (verifiedPaymentMethod.customer !== user.stripeCustomerId) {
          throw new Error("Payment method attachment verification failed");
        }

        finalPaymentMethodId = newPaymentMethod.id;
        console.log(`✅ Created and attached NEW payment method: ${finalPaymentMethodId}`);
      } catch (error) {
        console.error(`❌ Failed to create payment method:`, error);
        return NextResponse.json(
          {
            success: false,
            error: "Payment method creation failed",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 }
        );
      }
    } else {
      // For existing payment methods, try reuse but with better checks
      try {
        const existingPaymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

        // If not attached to our customer, attach it
        if (!existingPaymentMethod.customer) {
          await stripe.paymentMethods.attach(paymentMethodId, {
            customer: user.stripeCustomerId!,
          });
          console.log(`✅ Reusing payment method attached to customer: ${paymentMethodId}`);
        } else if (existingPaymentMethod.customer === user.stripeCustomerId) {
          console.log(`✅ Payment method already attached to our customer: ${paymentMethodId}`);
        } else {
          // Payment method belongs to someone else - create new one instead of failing
          console.log(`🔄 Payment method belongs to another customer. Creating new one...`);

          const newPaymentMethod = await stripe.paymentMethods.create({
            type: "card",
            card: { token: "tok_visa" },
          });

          await stripe.paymentMethods.attach(newPaymentMethod.id, {
            customer: user.stripeCustomerId!,
          });

          finalPaymentMethodId = newPaymentMethod.id;
          console.log(`✅ Created replacement payment method: ${finalPaymentMethodId}`);
        }
      } catch (stripeError: unknown) {
        console.error(`❌ Cannot reuse payment method, creating new one:`, stripeError);

        // Fallback: Create fresh payment method
        try {
          const fallbackPaymentMethod = await stripe.paymentMethods.create({
            type: "card",
            card: { token: "tok_visa" },
          });

          await stripe.paymentMethods.attach(fallbackPaymentMethod.id, {
            customer: user.stripeCustomerId!,
          });

          finalPaymentMethodId = fallbackPaymentMethod.id;
          console.log(`✅ Created fallback payment method: ${finalPaymentMethodId}`);
        } catch (fallbackError) {
          console.error(`❌ Fallback payment method creation failed:`, fallbackError);
          return NextResponse.json(
            {
              success: false,
              error: "Payment method setup failed",
              details: fallbackError instanceof Error ? fallbackError.message : "Unknown error",
            },
            { status: 500 }
          );
        }
      }
    }

    // Create payment intent with automatic confirmation
    let paymentIntent;
    try {
      console.log("💳 Creating payment intent with:", {
        amount: Math.round(miniDrawPackage.price * 100),
        currency: "usd",
        customer: user.stripeCustomerId,
        payment_method: finalPaymentMethodId,
      });

      // ✅ FIXED: Match working flow pattern from create-one-time-purchase-existing-user
      // PCI-COMPLIANT: Use automatic payment methods with redirects disabled for security
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(miniDrawPackage.price * 100), // Convert to cents
        currency: "usd",
        customer: user.stripeCustomerId!,
        payment_method: finalPaymentMethodId,
        confirm: true,
        return_url: `${baseUrl}/mini-draw-success`,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "never" as const, // PCI-COMPLIANT: Disable redirects for security
        },
        description: `${miniDrawPackage.name}`, // Add meaningful description
        metadata: {
          type: "mini-draw",
          packageId: miniDrawPackage._id,
          miniDrawId: miniDrawId, // Link to specific MiniDraw
          userId: user._id.toString(),
          entriesCount: miniDrawPackage.entries.toString(),
          packageName: miniDrawPackage.name,
          price: Math.round(miniDrawPackage.price * 100).toString(), // Price in cents
        },
      });

      console.log("✅ Payment intent created successfully:", {
        id: paymentIntent.id,
        status: paymentIntent.status,
      });
    } catch (stripeError) {
      console.error("❌ Stripe payment intent creation failed:", stripeError);
      return NextResponse.json(
        {
          success: false,
          error: "Payment processing failed",
          details: stripeError instanceof Error ? stripeError.message : "Unknown payment error",
        },
        { status: 400 }
      );
    }

    // ✅ CRITICAL: Handle different payment statuses and wait for settlement
    if (paymentIntent.status === "succeeded") {
      console.log(`🔍 Payment succeeded immediately, verifying payment settlement...`);

      // Wait for payment to be fully settled (not just authorized)
      await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second buffer

      // Re-fetch payment intent to ensure it's fully settled
      const verifiedPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id);

      if (verifiedPaymentIntent.status === "succeeded") {
        console.log(`✅ Payment fully verified and settled - benefits will be processed by webhook`);

        // ✅ CRITICAL: Don't call handleMiniDrawPaymentSuccess - webhook handles all benefit processing
        // This ensures single source of truth and prevents duplicate processing
        console.log(`📋 Benefits will be processed via webhook shortly`);

        // Return success with payment intent info - frontend will wait for webhook confirmation
        return NextResponse.json({
          success: true,
          message: "Mini draw purchase successful",
          data: {
            entriesAdded: miniDrawPackage.entries,
            packageName: miniDrawPackage.name,
            source: "mini-draw",
            paymentIntentId: paymentIntent.id,
            processingStatus: "pending", // Benefits will be processed via webhook
          },
          paymentIntent: {
            id: paymentIntent.id,
            status: paymentIntent.status,
            clientSecret: paymentIntent.client_secret,
          },
        });
      } else {
        console.error(`❌ Payment verification failed: ${verifiedPaymentIntent.status}`);
        return NextResponse.json(
          {
            success: false,
            error: "Payment verification failed",
            details: `Payment status changed to: ${verifiedPaymentIntent.status}. Payment was not fully settled.`,
          },
          { status: 400 }
        );
      }
    } else if (paymentIntent.status === "requires_action") {
      // Payment requires 3D Secure or other authentication
      console.log(`⏳ Payment requires action (3D Secure), waiting for completion...`);

      // Wait for payment to complete after authentication
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 second buffer

      // Re-fetch payment intent to check final status
      const finalPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id);
      console.log(`🔍 Final payment status after requires_action: ${finalPaymentIntent.status}`);

      if (finalPaymentIntent.status === "succeeded") {
        console.log(`✅ Payment completed successfully after authentication - benefits will be processed by webhook`);

        // ✅ CRITICAL: Don't call handleMiniDrawPaymentSuccess - webhook handles all benefit processing
        console.log(`📋 Benefits will be processed via webhook shortly`);

        // Return success with payment intent info - frontend will wait for webhook confirmation
        return NextResponse.json({
          success: true,
          message: "Mini draw purchase successful",
          data: {
            entriesAdded: miniDrawPackage.entries,
            packageName: miniDrawPackage.name,
            source: "mini-draw",
            paymentIntentId: paymentIntent.id,
            processingStatus: "pending", // Benefits will be processed via webhook
          },
          paymentIntent: {
            id: paymentIntent.id,
            status: paymentIntent.status,
            clientSecret: paymentIntent.client_secret,
          },
        });
      } else {
        console.error(`❌ Payment failed after requires_action: ${finalPaymentIntent.status}`);
        return NextResponse.json(
          {
            success: false,
            error: "Payment authentication failed",
            details: `Payment status: ${finalPaymentIntent.status}. Please try again or use a different payment method.`,
            requiresAction: true,
            clientSecret: paymentIntent.client_secret,
          },
          { status: 400 }
        );
      }
    } else if (paymentIntent.status === "processing") {
      // Payment is processing (async payment methods like bank transfers)
      console.log(`⏳ Payment is processing, waiting for completion...`);

      // Wait longer for async payment to complete
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 second buffer

      // Re-fetch payment intent to check final status
      const finalPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id);
      console.log(`🔍 Final payment status after processing: ${finalPaymentIntent.status}`);

      if (finalPaymentIntent.status === "succeeded") {
        console.log(`✅ Payment completed successfully after processing - benefits will be processed by webhook`);

        // ✅ CRITICAL: Don't call handleMiniDrawPaymentSuccess - webhook handles all benefit processing
        console.log(`📋 Benefits will be processed via webhook shortly`);

        // Return success with payment intent info - frontend will wait for webhook confirmation
        return NextResponse.json({
          success: true,
          message: "Mini draw purchase successful",
          data: {
            entriesAdded: miniDrawPackage.entries,
            packageName: miniDrawPackage.name,
            source: "mini-draw",
            paymentIntentId: paymentIntent.id,
            processingStatus: "pending", // Benefits will be processed via webhook
          },
          paymentIntent: {
            id: paymentIntent.id,
            status: paymentIntent.status,
            clientSecret: paymentIntent.client_secret,
          },
        });
      } else {
        console.error(`❌ Payment failed after processing: ${finalPaymentIntent.status}`);
        return NextResponse.json(
          {
            success: false,
            error: "Payment processing failed",
            details: `Payment status: ${finalPaymentIntent.status}`,
          },
          { status: 400 }
        );
      }
    } else if (paymentIntent.status === "requires_payment_method") {
      // Payment method was invalid or not properly attached
      console.error(`❌ Payment requires payment method - payment method may not be valid or attached`);
      return NextResponse.json(
        {
          success: false,
          error: "Payment method invalid",
          details: "The payment method could not be used. Please try again or use a different payment method.",
        },
        { status: 400 }
      );
    } else {
      // Any other status is a failure
      console.error(`❌ Payment intent status: ${paymentIntent.status} for mini draw package: ${miniDrawPackage._id}`);
      return NextResponse.json(
        {
          success: false,
          error: "Payment failed",
          details: `Payment status: ${paymentIntent.status}. Please try again or contact support.`,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("❌ One-click purchase error:", error);
    console.error("❌ Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        success: false,
        error: "One-click purchase failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle payment intent creation for manual confirmation
 */
async function handlePaymentIntentCreation(
  user: { _id: string; stripeCustomerId?: string },
  miniDrawPackage: { _id: string; name: string; price: number; entries: number },
  miniDrawId: string,
  paymentMethodId?: string
) {
  try {
    const shouldConfirm = !!paymentMethodId;

    // Build payment intent data conditionally
    const basePaymentIntentData = {
      amount: Math.round(miniDrawPackage.price * 100), // Convert to cents
      currency: "usd",
      customer: user.stripeCustomerId!,
      confirm: shouldConfirm,
      description: `${miniDrawPackage.name}`, // Add meaningful description
      metadata: {
        type: "mini-draw",
        packageId: miniDrawPackage._id,
        miniDrawId: miniDrawId, // Link to specific MiniDraw
        userId: user._id.toString(),
        entriesCount: miniDrawPackage.entries.toString(),
        packageName: miniDrawPackage.name,
        price: Math.round(miniDrawPackage.price * 100).toString(), // Price in cents
      },
    };

    // Include payment_method if provided
    if (paymentMethodId) {
      Object.assign(basePaymentIntentData, { payment_method: paymentMethodId });
    }

    // Include return_url only when confirming (required by Stripe when confirm=true)
    if (shouldConfirm) {
      Object.assign(basePaymentIntentData, {
        return_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/mini-draw-success`,
      });
    } else {
      // When not confirming, use automatic payment methods
      Object.assign(basePaymentIntentData, {
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "never" as const,
        },
      });
    }

    const paymentIntent = await stripe.paymentIntents.create(basePaymentIntentData);

    return NextResponse.json({
      success: true,
      requiresPayment: !paymentMethodId,
      clientSecret: paymentIntent.client_secret,
      data: {
        packageId: miniDrawPackage._id,
        amount: miniDrawPackage.price,
        entriesCount: miniDrawPackage.entries,
        paymentIntentId: paymentIntent.id,
        processingStatus: "pending",
      },
    });
  } catch (error) {
    console.error("Payment intent creation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create payment intent",
      },
      { status: 500 }
    );
  }
}
