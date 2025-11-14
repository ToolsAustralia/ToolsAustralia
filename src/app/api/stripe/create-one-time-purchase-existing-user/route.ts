import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";
import { stripe } from "@/lib/stripe";
import { recordReferralPurchase } from "@/lib/referral";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
// Klaviyo integration handled by webhook for best practices
// Benefits are granted via webhook processing only

const createOneTimePurchaseExistingUserSchema = z.object({
  packageId: z.string().min(1, "Package ID is required"),
  paymentMethodId: z.string().min(1, "Payment method ID is required").optional(),
  referralCode: z.string().optional(),
});

/**
 * Note: Benefits are granted via webhook processing only
 * This function is kept for API response structure but no longer processes benefits
 */
type MinimalUser = { _id: string };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleOneTimePaymentSuccess(
  user: MinimalUser,
  membershipPackage: {
    _id: string;
    name: string;
    price: number;
    totalEntries: number;
  },
  paymentIntentId: string
) {
  console.log(`✅ ONE-TIME PAYMENT SUCCESS: Payment ${paymentIntentId} created successfully`);
  console.log(`📋 Benefits will be granted via webhook processing shortly`);

  // No benefit processing here - webhook will handle it
  return {
    success: true,
    message: "Payment successful. Benefits will be processed shortly.",
    paymentIntentId,
    packageName: membershipPackage.name,
    entriesCount: membershipPackage.totalEntries,
  };
}

// ✅ REMOVED: addEntriesToMajorDrawImmediately function - now handled by processPaymentBenefits utility

/**
 * Get the base URL for API requests
 * Prioritizes NEXT_PUBLIC_APP_URL environment variable
 * Validates production environment requires the URL to be set
 */
function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_APP_URL must be set in production environment");
  }

  console.warn(`⚠️ NEXT_PUBLIC_APP_URL not set, falling back to localhost:3000`);
  return "http://localhost:3000";
}

/**
 * POST /api/stripe/create-one-time-purchase-existing-user
 * Create a one-time purchase payment intent for an existing logged-in user
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
    const validatedData = createOneTimePurchaseExistingUserSchema.parse(body);

    console.log(`🛒 Creating one-time purchase for existing user: ${session.user.id}`);

    // Get the existing user
    const existingUser = await User.findById(session.user.id);
    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get the package (check both regular membership packages and mini draw packages)
    let membershipPackage = getPackageById(validatedData.packageId);
    let isMiniDrawPackage = false;

    // If not found in regular packages, check mini draw packages
    if (!membershipPackage) {
      const miniDrawPackage = getMiniDrawPackageById(validatedData.packageId);
      if (miniDrawPackage && miniDrawPackage.isActive) {
        // Convert mini draw package to membership package format for compatibility
        membershipPackage = {
          _id: miniDrawPackage._id,
          name: miniDrawPackage.name,
          price: miniDrawPackage.price,
          totalEntries: miniDrawPackage.entries,
          isActive: miniDrawPackage.isActive,
          type: "one-time" as const,
          description: miniDrawPackage.description,
          features: [
            `${miniDrawPackage.entries} Free Entries`,
            `${miniDrawPackage.partnerDiscountDays} Days Partner Discounts`,
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        isMiniDrawPackage = true;
        console.log("🎲 Mini draw package detected:", miniDrawPackage.name);
      }
    }

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

    let paymentMethodId = validatedData.paymentMethodId;

    if (!paymentMethodId) {
      const defaultMethod = existingUser.savedPaymentMethods?.find((pm: Record<string, unknown>) => pm.isDefault);
      if (defaultMethod && typeof defaultMethod.paymentMethodId === "string") {
        paymentMethodId = defaultMethod.paymentMethodId;
      } else if (existingUser.savedPaymentMethods?.length) {
        const fallbackMethod = existingUser.savedPaymentMethods[0];
        if (fallbackMethod && typeof fallbackMethod.paymentMethodId === "string") {
          paymentMethodId = fallbackMethod.paymentMethodId;
        }
      }

      if (!paymentMethodId) {
        return NextResponse.json(
          { success: false, error: "No saved payment method available. Please add a card first." },
          { status: 400 }
        );
      }
    }

    // Ensure payment method belongs to this customer
    const stripePaymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    if (!stripePaymentMethod) {
      return NextResponse.json({ success: false, error: "Payment method not found" }, { status: 404 });
    }

    if (stripePaymentMethod.customer !== stripeCustomerId) {
      try {
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: stripeCustomerId,
        });
      } catch (error) {
        console.error("❌ Failed to attach payment method to customer:", error);
        return NextResponse.json(
          { success: false, error: "Unable to attach payment method to customer" },
          { status: 400 }
        );
      }
    }

    console.log(`💳 Using payment method ${paymentMethodId} for one-time purchase`);

    // Create payment intent for one-time purchase
    // PCI-COMPLIANT: Use automatic payment methods with redirects disabled for security
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(membershipPackage.price * 100), // Convert to cents
      currency: "usd",
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      confirm: true,
      return_url: `${getBaseUrl()}/purchase-success`,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never", // PCI-COMPLIANT: Disable redirects for security
      },
      description: `${membershipPackage.name}`, // Add meaningful description
      metadata: {
        items: JSON.stringify([
          {
            type: isMiniDrawPackage ? "mini-draw" : "membership",
            id: membershipPackage._id,
            name: membershipPackage.name,
            price: membershipPackage.price,
          },
        ]),
        packageId: membershipPackage._id,
        userId: existingUser._id.toString(),
        packageName: membershipPackage.name,
        packageType: isMiniDrawPackage ? "mini-draw" : "one-time",
        entriesCount: (membershipPackage.totalEntries || membershipPackage.entriesPerMonth || 0).toString(),
        price: Math.round(membershipPackage.price * 100).toString(), // Price in cents for webhook processing
      },
    });

    console.log(`✅ Payment intent created: ${paymentIntent.id} with status: ${paymentIntent.status}`);

    // ✅ CRITICAL: Handle different payment statuses and wait for settlement
    if (paymentIntent.status === "succeeded") {
      console.log(`🔍 Payment succeeded immediately, verifying payment settlement...`);

      // Wait for payment to be fully settled (not just authorized)
      await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second buffer

      // Re-fetch payment intent to ensure it's fully settled
      const verifiedPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id);

      if (verifiedPaymentIntent.status === "succeeded") {
        console.log(`✅ Payment fully verified and settled - benefits will be processed by webhook`);

        // Benefits will be processed by webhook - just log success
        console.log(`✅ Payment completed successfully for user: ${existingUser.email}`);
        console.log(`📦 Package: ${membershipPackage.name} ($${membershipPackage.price})`);
        console.log(`📋 Benefits will be processed via webhook shortly`);

        // ✅ Klaviyo integration handled by webhook for reliability and best practices
        console.log(`📊 Klaviyo events will be tracked via webhook when payment is confirmed`);
      } else {
        console.error(`❌ Payment verification failed: ${verifiedPaymentIntent.status}`);
        return NextResponse.json(
          {
            success: false,
            error: "Payment verification failed",
            details: "Payment was not fully settled",
          },
          { status: 400 }
        );
      }
    } else if (paymentIntent.status === "requires_action" || paymentIntent.status === "processing") {
      console.log(`⏳ Payment requires action or is processing, waiting for completion...`);

      // Wait longer for payment to complete
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 second buffer

      // Re-fetch payment intent to check final status
      const finalPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id);
      console.log(`🔍 Final payment status: ${finalPaymentIntent.status}`);

      if (finalPaymentIntent.status === "succeeded") {
        console.log(`✅ Payment completed successfully after waiting - benefits will be processed by webhook`);

        // Benefits will be processed by webhook - just log success
        console.log(`✅ Payment completed successfully for user: ${existingUser.email}`);
        console.log(`📦 Package: ${membershipPackage.name} ($${membershipPackage.price})`);
        console.log(`📋 Benefits will be processed via webhook shortly`);
      } else {
        console.error(`❌ Payment failed after waiting: ${finalPaymentIntent.status}`);
        return NextResponse.json(
          {
            success: false,
            error: "Payment failed",
            details: `Payment status: ${finalPaymentIntent.status}`,
          },
          { status: 400 }
        );
      }
    } else {
      console.error(`❌ Payment intent status: ${paymentIntent.status} for package: ${membershipPackage._id}`);
      return NextResponse.json(
        {
          success: false,
          error: "Payment failed",
          details: `Payment status: ${paymentIntent.status}`,
        },
        { status: 400 }
      );
    }

    if (validatedData.referralCode) {
      try {
        await recordReferralPurchase({
          referralCode: validatedData.referralCode,
          inviteeUserId: existingUser._id.toString(),
          inviteeEmail: existingUser.email,
          inviteeName: `${existingUser.firstName} ${existingUser.lastName}`.trim(),
          qualifyingOrderId: paymentIntent.id,
          qualifyingOrderType: "one-time",
        });
      } catch (referralError) {
        console.error("Referral purchase capture failed:", referralError);
      }
    }

    return NextResponse.json({
      success: true,
      message: "One-time package purchase successful",
      data: {
        entriesAdded: membershipPackage.totalEntries,
        totalEntries: existingUser.accumulatedEntries || 0,
        packageName: membershipPackage.name,
        source: "one-time-package",
        paymentVerified: true,
      },
      paymentIntent: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        clientSecret: paymentIntent.client_secret,
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
    console.error("❌ One-time purchase creation failed:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.issues }, { status: 400 });
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { error: "Failed to create one-time purchase", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: "Failed to create one-time purchase" }, { status: 500 });
  }
}

// REMOVED: addEntriesToMajorDraw function moved to webhook-only processing
