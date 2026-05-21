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
 * Updates the default payment method on the Stripe subscription + customer.
 * Allowed for fully active subscriptions and for failed-renewal states (past_due / unpaid) where the
 * Stripe subscription still exists and needs a new card — not only when Mongo marks isActive true.
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

    if (!user.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "No subscription found. Cannot update payment method." },
        { status: 400 }
      );
    }

    const subStatus = (user.subscription?.status ?? "").toLowerCase();
    const isDelinquentRenewal = subStatus === "past_due" || subStatus === "unpaid";
    const isCanceled = subStatus === "canceled" || subStatus === "cancelled";

    if (isCanceled) {
      return NextResponse.json(
        { error: "This subscription is canceled. Add a card when you resubscribe." },
        { status: 400 }
      );
    }

    if (!user.subscription?.isActive && !isDelinquentRenewal) {
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

