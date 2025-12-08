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
    } else {
      // Guest user - create a temporary Stripe customer
      // The actual customer will be created during the purchase process
      const customer = await stripe.customers.create({
        metadata: {
          type: "guest",
          temporary: "true",
        },
      });
      stripeCustomerId = customer.id;
      userId = "guest";
    }

    // Get or create Stripe customer for authenticated users
    if (session?.user?.id && !stripeCustomerId) {
      const user = await User.findById(session.user.id);
      if (user) {
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
    }

    // Create PaymentIntent for payment method collection with amount
    // This ensures wallet payments show the correct amount
    const paymentIntent = await stripe.paymentIntents.create({
      amount: validatedData.amount, // Amount in cents
      currency: validatedData.currency,
      customer: stripeCustomerId,
      setup_future_usage: "off_session", // Automatically save payment method for future use
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never", // PCI-COMPLIANT: Disable redirects for security
      },
      metadata: {
        userId: userId,
        userEmail: userEmail || "guest",
        type: session?.user?.id ? "authenticated" : "guest",
        ...(validatedData.packageId && { packageId: validatedData.packageId }),
        ...(validatedData.packageName && { packageName: validatedData.packageName }),
      },
    });

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
