import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { stripe } from "@/lib/stripe";
import { z } from "zod";

const updateSubscriptionPaymentMethodSchema = z.object({
  paymentMethodId: z.string().min(1, "Payment method ID is required"),
});

/**
 * POST /api/stripe/subscription/update-payment-method
 * Updates the payment method for an active subscription
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
    const { paymentMethodId } = updateSubscriptionPaymentMethodSchema.parse(body);

    // Get the user
    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user has an active subscription
    if (!user.subscription?.isActive || !user.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "No active subscription found. Cannot update payment method." },
        { status: 400 }
      );
    }

    // Ensure user has a Stripe customer ID
    if (!user.stripeCustomerId) {
      return NextResponse.json({ error: "User does not have a Stripe customer ID" }, { status: 400 });
    }

    // Verify the payment method exists and belongs to the customer
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    if (!paymentMethod) {
      return NextResponse.json({ error: "Payment method not found" }, { status: 404 });
    }

    // Attach payment method to customer if not already attached
    if (paymentMethod.customer !== user.stripeCustomerId) {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: user.stripeCustomerId,
      });
    }

    // Update the Stripe subscription's default payment method
    await stripe.subscriptions.update(user.stripeSubscriptionId, {
      default_payment_method: paymentMethodId,
    });

    // Update the Stripe customer's default payment method for future invoices
    await stripe.customers.update(user.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Update the user's saved payment methods to mark this as default
    if (user.savedPaymentMethods && user.savedPaymentMethods.length > 0) {
      user.savedPaymentMethods.forEach((pm: { paymentMethodId: string; isDefault: boolean }) => {
        pm.isDefault = pm.paymentMethodId === paymentMethodId;
      });
      await user.save();
    }

    return NextResponse.json({
      success: true,
      message: "Subscription payment method updated successfully",
      data: {
        paymentMethodId,
        subscriptionId: user.stripeSubscriptionId,
      },
    });
  } catch (error) {
    console.error("Error updating subscription payment method:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update subscription payment method",
      },
      { status: 500 }
    );
  }
}

