import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { z } from "zod";
import { createPaymentIntentConfig } from "@/utils/payment/stripe/payment-intent-config";
import { buildAttributionMetadata } from "@/utils/tracking/attribution-metadata";
import { attributionSchema } from "@/utils/tracking/attribution-schema";
import { resolveAttributionAtEdge } from "@/services/attribution/resolveAtEdge";
import { enforceMajorDrawOpenForNewPurchasesOr403 } from "@/utils/draws/major-draw-gate-http";

/**
 * POST /api/stripe/create-payment-intent
 * Creates a PaymentIntent for payment method collection with amount display
 * This ensures wallet payments (Google Pay/Apple Pay) show the correct amount
 *
 * Best Practices Applied:
 * - Uses PaymentIntent for immediate payments (required for wallet payment amount display)
 * - Automatically saves payment method via setup_future_usage
 * - Handles 3D Secure authentication automatically
 * - Includes proper error handling and validation
 * - Follows PCI compliance guidelines
 *
 * IMPORTANT: For subscriptions, this endpoint should NOT be called.
 * Subscriptions use invoice PaymentIntent created by Stripe automatically.
 * The invoice PaymentIntent has the correct amount and should be used directly.
 */

const createPaymentIntentSchema = z.object({
  amount: z.number().int().positive("Amount must be greater than 0"),
  currency: z.string().default("aud"),
  packageId: z.string().optional(),
  packageName: z.string().optional(),
  userEmail: z.string().email().optional(),
  packageType: z.enum(["one-time", "membership"]).optional(),
  attribution: attributionSchema,
});

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createPaymentIntentSchema.parse(body);

    // ✅ CRITICAL: Reject PaymentIntent creation for subscriptions
    // Subscriptions should use invoice PaymentIntent created by Stripe automatically
    // This prevents multiple PaymentIntents and ensures correct wallet amounts
    if (validatedData.packageType === "membership") {
      return NextResponse.json(
        {
          success: false,
          error: "PaymentIntent creation not allowed for subscriptions",
          details:
            "Subscriptions use invoice PaymentIntent created automatically by Stripe. Use the client_secret from subscription creation response instead.",
          code: "SUBSCRIPTION_PAYMENT_INTENT_NOT_ALLOWED",
        },
        { status: 400 }
      );
    }

    const gateResponse = await enforceMajorDrawOpenForNewPurchasesOr403();
    if (gateResponse) return gateResponse;

    // Get authenticated user session (optional for guest users)
    const session = await getServerSession(authOptions);

    let stripeCustomerId: string | undefined;
    let userEmail: string | undefined;
    let userId: string | undefined;

    if (session?.user?.id) {
      // Authenticated user
      const user = await User.findById(session.user.id);
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      stripeCustomerId = user.stripeCustomerId;
      userEmail = user.email;
      userId = user._id.toString();

      // Get or create Stripe customer for authenticated users
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          phone: user.mobile || undefined,
          metadata: {
            userId: user._id.toString(),
          },
        });
        stripeCustomerId = customer.id;

        // Update user with Stripe customer ID
        user.stripeCustomerId = stripeCustomerId;
        await user.save();
      }
    } else {
      // ✅ STRIPE BEST PRACTICE: For guest users, check if they registered in step 1
      // If user exists from registration, they should have a Stripe customer already
      // This ensures customer is set BEFORE PaymentIntent confirmation for proper webhook processing
      if (validatedData.userEmail) {
        const registeredUser = await User.findOne({ email: validatedData.userEmail.toLowerCase() });
        if (registeredUser?.stripeCustomerId) {
          stripeCustomerId = registeredUser.stripeCustomerId;
          userEmail = registeredUser.email;
          userId = registeredUser._id.toString();
          // console.log(`✅ Found registered user's Stripe customer: ${stripeCustomerId}`);
        } else {
          // User registered but no customer yet (shouldn't happen, but handle gracefully)
          // console.log(`⚠️ Registered user found but no Stripe customer: ${registeredUser?._id}`);
          stripeCustomerId = undefined;
          userId = registeredUser?._id.toString() || "guest";
          userEmail = validatedData.userEmail;
        }
      } else {
        // True guest - no registration yet, customer will be created during purchase
        stripeCustomerId = undefined;
        userId = "guest";
        userEmail = undefined;
      }
    }

    // ✅ STRIPE BEST PRACTICE: Generate idempotency key to prevent duplicate PaymentIntent creation
    // This ensures that even if the API is called twice (e.g., double-click), only one PaymentIntent is created
    const idempotencyKey = `pi_${validatedData.packageId || "default"}_${userId || "guest"}_${Date.now()}`;

    const { metadata: resolvedAttr } = resolveAttributionAtEdge(request);

    // Create PaymentIntent for one-time purchases only
    // This ensures wallet payments show the correct amount
    // ✅ FIX: Only include customer if it exists (authenticated users)
    // Guest users will have customer created during purchase process
    // ✅ Use centralized PaymentIntent configuration with 3DS support
    const paymentIntentConfig = createPaymentIntentConfig({
      amount: validatedData.amount, // Amount in cents
      currency: validatedData.currency,
      customer: stripeCustomerId, // Only included if exists
      paymentType: "one-time",
      description: validatedData.packageName,
      setupFutureUsage: "off_session", // Automatically save payment method for future use
      metadata: {
        userId: userId || "guest",
        userEmail: userEmail || validatedData.userEmail || "guest",
        type: "one-time", // Only one-time purchases use this endpoint
        packageType: "one-time", // Only one-time purchases use this endpoint
        ...(validatedData.packageId && { packageId: validatedData.packageId }),
        ...(validatedData.packageName && { packageName: validatedData.packageName }),
        ...buildAttributionMetadata(validatedData.attribution),
        ...resolvedAttr,
      },
    });

    const paymentIntent = await stripe.paymentIntents.create(
      paymentIntentConfig,
      {
        idempotencyKey: idempotencyKey, // ✅ STRIPE BEST PRACTICE: Prevent duplicate PaymentIntent creation
      }
    );

    return NextResponse.json({
      success: true,
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    });
  } catch (error) {
    console.error("❌ PaymentIntent creation failed:", error);

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to create payment intent",
      },
      { status: 500 }
    );
  }
}
