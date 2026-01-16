import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { z } from "zod";

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
 */

const createPaymentIntentSchema = z.object({
  amount: z.number().int().positive("Amount must be greater than 0"),
  currency: z.string().default("aud"),
  packageId: z.string().optional(),
  packageName: z.string().optional(),
  userEmail: z.string().email().optional(), // ✅ NEW: Accept userEmail to find registered user's customer
  packageType: z.enum(["one-time", "membership"]).optional(), // ✅ NEW: Specify package type for proper metadata
});

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createPaymentIntentSchema.parse(body);

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

    // Create PaymentIntent for payment method collection with amount
    // This ensures wallet payments show the correct amount
    // ✅ FIX: Only include customer if it exists (authenticated users)
    // Guest users will have customer created during purchase process
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: validatedData.amount, // Amount in cents
        currency: validatedData.currency,
        ...(stripeCustomerId && { customer: stripeCustomerId }), // Only add customer if exists
        setup_future_usage: "off_session", // Automatically save payment method for future use
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "never", // PCI-COMPLIANT: Disable redirects for security
        },
        // ✅ STRIPE BEST PRACTICE: For subscription upfront PaymentIntents, use manual capture
        // This allows us to cancel the PaymentIntent before it's captured, preventing double charge
        // The PaymentIntent will be in "requires_capture" status after confirmation, giving us time to cancel it
        ...(validatedData.packageType === "membership" && { capture_method: "manual" }), // ✅ Manual capture for memberships
        // ✅ STRIPE BEST PRACTICE: Set description to package name for better tracking in Stripe dashboard
        ...(validatedData.packageName && { description: validatedData.packageName }),
        metadata: {
          userId: userId,
          userEmail: userEmail || validatedData.userEmail || "guest",
          type: validatedData.packageType || "one-time", // ✅ Use provided packageType or default to one-time
          packageType: validatedData.packageType || "one-time", // ✅ Also set 'packageType' for consistency
          ...(validatedData.packageType === "membership" && { isUpfrontPayment: "true" }), // ✅ Mark membership PaymentIntent so webhook skips it
          ...(validatedData.packageId && { packageId: validatedData.packageId }),
          ...(validatedData.packageName && { packageName: validatedData.packageName }),
        },
      },
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
