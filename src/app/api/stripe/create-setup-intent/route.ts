import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";

/**
 * POST /api/stripe/create-setup-intent
 * Creates a SetupIntent for payment method creation following Stripe best practices
 *
 * Best Practices Applied:
 * - Uses SetupIntent for payment method creation (recommended by Stripe)
 * - Handles 3D Secure authentication automatically
 * - Includes proper error handling and validation
 * - Follows PCI compliance guidelines
 */
export async function POST() {
  try {
    await connectDB();

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

      // console.log(`🔧 Creating SetupIntent for authenticated user: ${user.email}`);

      stripeCustomerId = user.stripeCustomerId;
      userEmail = user.email;
      userId = user._id.toString();
    } else {
      // ✅ FIX: Guest user - DON'T create customer upfront
      // Customer will be created during the purchase process when payment is confirmed
      // This prevents unnecessary customer creation and reduces Stripe API calls
      stripeCustomerId = undefined; // No customer yet for guest users
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

        // console.log(`✅ Created new Stripe customer: ${stripeCustomerId}`);
      }
    }

    // Create SetupIntent for payment method creation
    // This is the Stripe-recommended approach for saving payment methods
    // ✅ FIX: Only include customer if it exists (authenticated users)
    // Guest users will have customer created during purchase process
    // Note: SetupIntent can be created without customer - Stripe will create one when payment method is attached
    const setupIntent = await stripe.setupIntents.create({
      ...(stripeCustomerId && { customer: stripeCustomerId }), // Only add customer if exists
      payment_method_types: ["card"],
      usage: "off_session", // Payment method will be used for future payments
      metadata: {
        userId: userId,
        userEmail: userEmail || "guest",
        type: session?.user?.id ? "authenticated" : "guest",
      },
    });

    // console.log(`✅ SetupIntent created: ${setupIntent.id}`);

    return NextResponse.json({
      success: true,
      client_secret: setupIntent.client_secret,
      setup_intent_id: setupIntent.id,
    });
  } catch (error) {
    console.error("❌ SetupIntent creation failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to create payment method setup",
      },
      { status: 500 }
    );
  }
}
