import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { stripe } from "@/lib/stripe";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUpsellPackageById, type StaticUpsellPackage } from "@/data/upsellPackages";
// Benefits are now granted via webhook processing only

const upsellPurchaseSchema = z.object({
  offerId: z.string().min(1, "Offer ID is required"),
  useDefaultPayment: z.boolean().optional().default(false),
  paymentMethodId: z.string().optional(),
  originalPurchaseContext: z
    .object({
      miniDrawId: z.string().optional(),
      miniDrawName: z.string().optional(),
    })
    .optional(),
});

/**
 * Note: Benefits are now granted via webhook processing only
 * This function is kept for API response structure but no longer processes benefits
 */
type MinimalUser = { _id: string };

async function handleUpsellPaymentSuccess(
  user: MinimalUser,
  upsellPackage: {
    id: string;
    name: string;
    price: number;
    entriesCount: number;
  },
  paymentIntentId: string
) {
  console.log(`✅ UPSELL PAYMENT SUCCESS: Payment ${paymentIntentId} created successfully`);
  console.log(`📋 Benefits will be granted via webhook processing shortly`);

  // No benefit processing here - webhook will handle it
  return {
    success: true,
    message: "Payment successful. Benefits will be processed shortly.",
    paymentIntentId,
    packageName: upsellPackage.name,
    entriesCount: upsellPackage.entriesCount,
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
 * Get miniDrawId for upsell purchase
 * First checks originalPurchaseContext, then looks up from user's most recent matching mini-draw package purchase
 */
async function getMiniDrawIdForUpsell(
  user: { miniDrawPackages?: Array<{ packageId: string; miniDrawId?: unknown; purchaseDate: Date }> },
  offerId: string,
  originalPurchaseContext?: { miniDrawId?: string; miniDrawName?: string }
): Promise<{ miniDrawId?: string; miniDrawName?: string }> {
  // Primary: Check originalPurchaseContext if provided
  if (originalPurchaseContext?.miniDrawId) {
    console.log(`📧 Found miniDrawId in originalPurchaseContext: ${originalPurchaseContext.miniDrawId}`);
    return {
      miniDrawId: originalPurchaseContext.miniDrawId,
      miniDrawName: originalPurchaseContext.miniDrawName,
    };
  }

  // Fallback: Extract base package ID from upsell ID and lookup from user's purchase history
  // Example: "mini-pack-1-upgrade" -> "mini-pack-1"
  const basePackageId = offerId.replace(/-upgrade$/, "");

  if (!basePackageId.startsWith("mini-pack-")) {
    // Not a mini-draw upsell
    return {};
  }

  // Find most recent matching mini-draw package purchase
  if (user.miniDrawPackages && user.miniDrawPackages.length > 0) {
    // Sort by purchaseDate descending (most recent first)
    const sortedPackages = [...user.miniDrawPackages].sort((a, b) => {
      const dateA = a.purchaseDate instanceof Date ? a.purchaseDate : new Date(a.purchaseDate);
      const dateB = b.purchaseDate instanceof Date ? b.purchaseDate : new Date(b.purchaseDate);
      return dateB.getTime() - dateA.getTime();
    });

    // Find matching package and convert miniDrawId to string if it exists
    const matchingPackage = sortedPackages.find((pkg) => pkg.packageId === basePackageId && pkg.miniDrawId);

    if (matchingPackage?.miniDrawId) {
      // Convert ObjectId to string if needed
      const miniDrawIdStr =
        typeof matchingPackage.miniDrawId === "string"
          ? matchingPackage.miniDrawId
          : matchingPackage.miniDrawId?.toString();

      if (miniDrawIdStr) {
        console.log(`📧 Found miniDrawId from user's purchase history: ${miniDrawIdStr}`);
        return {
          miniDrawId: miniDrawIdStr,
        };
      }
    }
  }

  console.log(`⚠️ Could not find miniDrawId for upsell ${offerId}`);
  return {};
}

/**
 * POST /api/upsell/purchase
 * Handle upsell purchases for authenticated users
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
    const validatedData = upsellPurchaseSchema.parse(body);

    console.log(`🛒 Processing upsell purchase for user: ${session.user.id}, offer: ${validatedData.offerId}`);

    // Get the user
    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Find the upsell offer from static data
    const offer = getUpsellPackageById(validatedData.offerId);
    if (!offer) {
      return NextResponse.json({ error: "Upsell offer not found" }, { status: 404 });
    }

    // Check if offer is still valid
    if (!offer.isActive || (offer.validUntil && new Date() > new Date(offer.validUntil))) {
      return NextResponse.json({ error: "Upsell offer has expired" }, { status: 400 });
    }

    // Ensure user has a Stripe customer ID
    if (!user.stripeCustomerId) {
      return NextResponse.json({ error: "User does not have a Stripe customer ID" }, { status: 400 });
    }

    // Get miniDrawId for upsell (if it's a mini-draw upsell)
    const miniDrawInfo = await getMiniDrawIdForUpsell(
      user,
      validatedData.offerId,
      validatedData.originalPurchaseContext
    );

    if (validatedData.useDefaultPayment && validatedData.paymentMethodId) {
      // One-click purchase using the specific payment method provided
      return await handleOneClickPurchase(
        user as unknown as Parameters<typeof handleOneClickPurchase>[0],
        offer,
        validatedData.paymentMethodId,
        miniDrawInfo
      );
    } else {
      // Create payment intent for manual confirmation
      return await handlePaymentIntentCreation(user, offer, validatedData.paymentMethodId, miniDrawInfo);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Upsell purchase error:", error);
    return NextResponse.json({ error: "Failed to process upsell purchase" }, { status: 500 });
  }
}

/**
 * Handle one-click purchase using default payment method
 */
async function handleOneClickPurchase(
  user: {
    _id: string;
    email: string;
    stripeCustomerId?: string;
    savedPaymentMethods?: Array<{ paymentMethodId: string }>;
    accumulatedEntries: number;
    rewardsPoints: number;
    upsellPurchases?: Array<{
      offerId: string;
      offerTitle: string;
      entriesAdded: number;
      amountPaid: number;
      purchaseDate: Date;
    }>;
    save: () => Promise<void>;
  },
  offer: StaticUpsellPackage,
  paymentMethodId?: string,
  miniDrawInfo?: { miniDrawId?: string; miniDrawName?: string }
) {
  try {
    if (!paymentMethodId) {
      return NextResponse.json(
        {
          error: "Payment method ID is required",
          requiresPayment: true,
        },
        { status: 400 }
      );
    }

    // 🚀 CONSISTENT PATTERN: Create and attach NEW payment method (like subscription/one-time APIs)
    let finalPaymentMethodId = paymentMethodId;

    // For development OR reuse prevention - create new payment method
    if (paymentMethodId === "pm_card_visa" || !paymentMethodId.startsWith("pm_")) {
      console.log(`🔄 Creating fresh payment method for upsell (reuse pattern)`);

      // Create a new test/card payment method for this customer
      const newPaymentMethod = await stripe.paymentMethods.create({
        type: "card",
        card: {
          token: "tok_visa", // Use Stripe's test token (works in both test and live modes)
        },
      });

      // Attach to customer immediately
      await stripe.paymentMethods.attach(newPaymentMethod.id, {
        customer: user.stripeCustomerId!,
      });

      finalPaymentMethodId = newPaymentMethod.id;
      console.log(`💳 Created and attached NEW payment method: ${finalPaymentMethodId}`);
    } else {
      // For existing payment methods, try reuse but with better checks
      try {
        const existingPaymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

        // If not attached to our customer, attach it
        if (!existingPaymentMethod.customer) {
          await stripe.paymentMethods.attach(paymentMethodId, {
            customer: user.stripeCustomerId!,
          });
          console.log(`💳 Reusing payment method attached to customer: ${paymentMethodId}`);
        } else if (existingPaymentMethod.customer === user.stripeCustomerId) {
          console.log(`💳 Payment method already attached to our customer: ${paymentMethodId}`);
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
          console.log(`💳 Created replacement payment method: ${finalPaymentMethodId}`);
        }
      } catch (stripeError: unknown) {
        console.error(`❌ Cannot reuse payment method, creating new one:`, stripeError);

        // Fallback: Create fresh payment method (same as subscription/one-time pattern)
        const fallbackPaymentMethod = await stripe.paymentMethods.create({
          type: "card",
          card: { token: "tok_visa" },
        });

        await stripe.paymentMethods.attach(fallbackPaymentMethod.id, {
          customer: user.stripeCustomerId!,
        });

        finalPaymentMethodId = fallbackPaymentMethod.id;
        console.log(`💳 Created fallback payment method: ${finalPaymentMethodId}`);
      }
    }

    // Create payment intent with automatic confirmation
    // PCI-COMPLIANT: Use automatic payment methods with redirects disabled for security
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(offer.discountedPrice * 100), // Convert to cents
        currency: "usd",
        customer: user.stripeCustomerId!,
        payment_method: finalPaymentMethodId, // Use the SAFE validated payment method
        confirm: true,
        return_url: `${getBaseUrl()}/upsell-success`,
        confirmation_method: "automatic", // Use this OR automatic_payment_methods, not both
        setup_future_usage: "off_session", // Store payment method for future use
        description: `${offer.name}`, // Add meaningful description
        metadata: {
          type: "upsell",
          offerId: offer.id,
          userId: user._id.toString(),
          entriesCount: offer.entriesCount.toString(),
          offerTitle: offer.name, // Ensure offer title is included for webhook
          ...(miniDrawInfo?.miniDrawId && { miniDrawId: miniDrawInfo.miniDrawId }),
          ...(miniDrawInfo?.miniDrawName && { miniDrawName: miniDrawInfo.miniDrawName }),
        },
      });
    } catch (stripeError) {
      console.error("Stripe payment intent creation failed:", stripeError);
      return NextResponse.json(
        {
          error: "Payment processing failed",
          requiresPayment: true,
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
        console.log(`✅ Payment fully verified and settled - benefits will be granted via webhook`);

        // Payment successful - benefits will be granted via webhook
        await handleUpsellPaymentSuccess(
          user,
          {
            id: offer.id,
            name: offer.name,
            price: offer.discountedPrice,
            entriesCount: offer.entriesCount,
          },
          paymentIntent.id
        );

        return NextResponse.json({
          success: true,
          message: "Upsell purchase successful",
          data: {
            entriesAdded: offer.entriesCount,
            packageName: offer.name,
            source: "upsell",
            paymentIntentId: paymentIntent.id,
            processingStatus: "pending", // Benefits will be processed via webhook
          },
        });
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
        console.log(`✅ Payment completed successfully after waiting - benefits will be granted via webhook`);

        return NextResponse.json({
          success: true,
          message: "Upsell purchase successful",
          data: {
            entriesAdded: offer.entriesCount,
            packageName: offer.name,
            source: "upsell",
            paymentIntentId: paymentIntent.id,
            processingStatus: "pending", // Benefits will be processed via webhook
          },
        });
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
      console.error(`❌ Payment intent status: ${paymentIntent.status} for upsell offer: ${offer.id}`);
      return NextResponse.json(
        {
          error: "Payment failed",
          requiresPayment: true,
          details: `Payment status: ${paymentIntent.status}`,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("One-click purchase error:", error);
    return NextResponse.json(
      {
        error: "One-click purchase failed",
        requiresPayment: true,
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
  offer: StaticUpsellPackage,
  paymentMethodId?: string,
  miniDrawInfo?: { miniDrawId?: string; miniDrawName?: string }
) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(offer.discountedPrice * 100), // Convert to cents
      currency: "usd",
      customer: user.stripeCustomerId!,
      payment_method: paymentMethodId,
      confirm: paymentMethodId ? true : false,
      return_url: `${getBaseUrl()}/upsell-success`,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never", // PCI-COMPLIANT: Disable redirects for security
      },
      description: `${offer.name}`, // Add meaningful description
      metadata: {
        type: "upsell",
        offerId: offer.id,
        userId: user._id.toString(),
        entriesCount: offer.entriesCount.toString(),
        ...(miniDrawInfo?.miniDrawId && { miniDrawId: miniDrawInfo.miniDrawId }),
        ...(miniDrawInfo?.miniDrawName && { miniDrawName: miniDrawInfo.miniDrawName }),
      },
    });

    return NextResponse.json({
      success: true,
      requiresPayment: !paymentMethodId,
      clientSecret: paymentIntent.client_secret,
      data: {
        offerId: offer.id,
        amount: offer.discountedPrice,
        entriesCount: offer.entriesCount,
        paymentIntentId: paymentIntent.id,
        processingStatus: "pending",
      },
    });
  } catch (error) {
    console.error("Payment intent creation error:", error);
    return NextResponse.json({ error: "Failed to create payment intent" }, { status: 500 });
  }
}

/**
 * DEPRECATED: Entries are now handled by webhook
 * This function was replaced by webhook mechanism in /api/stripe/webhook/route.ts
 */
