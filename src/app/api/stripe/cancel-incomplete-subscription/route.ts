import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil",
});

/**
 * POST /api/stripe/cancel-incomplete-subscription
 * Cancel an incomplete subscription (used when user changes package after registration)
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    const body = await request.json();
    const { subscriptionId, userId } = body;

    if (!subscriptionId || typeof subscriptionId !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Subscription ID is required",
        },
        { status: 400 }
      );
    }

    // ✅ Support both authenticated and guest user flows
    // Guest users who just registered might not have a session yet
    let user = null;
    if (session?.user?.id) {
      // Authenticated user flow
      user = await User.findById(session.user.id);
      if (!user) {
        return NextResponse.json(
          {
            success: false,
            error: "User not found",
          },
          { status: 404 }
        );
      }
    } else if (userId) {
      // Guest user flow - user just registered but no session yet
      user = await User.findById(userId);
      if (!user) {
        return NextResponse.json(
          {
            success: false,
            error: "User not found",
          },
          { status: 404 }
        );
      }
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    // Retrieve subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Verify subscription belongs to user's customer
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    if (user.stripeCustomerId !== customerId) {
      return NextResponse.json(
        {
          success: false,
          error: "Subscription does not belong to user",
        },
        { status: 403 }
      );
    }

    // Only cancel incomplete subscriptions
    if (subscription.status !== "incomplete" && subscription.status !== "incomplete_expired") {
      return NextResponse.json(
        {
          success: false,
          error: "Only incomplete subscriptions can be cancelled",
          details: `Subscription status is ${subscription.status}`,
        },
        { status: 400 }
      );
    }

    // Cancel the subscription
    await stripe.subscriptions.cancel(subscriptionId);

    // ✅ CRITICAL: Clear user's stripeSubscriptionId to prevent issues when creating new subscription
    // This ensures that when a new subscription is created, it doesn't try to reuse the cancelled one
    if (user.stripeSubscriptionId === subscriptionId) {
      user.stripeSubscriptionId = undefined;
      user.subscription = undefined;
      await user.save();
      console.log(`✅ Cleared user's subscription reference after cancellation: ${subscriptionId}`);
    }

    console.log(`[Subscription] Cancelled incomplete subscription: ${subscriptionId}`);

    return NextResponse.json({
      success: true,
      message: "Subscription cancelled successfully",
    });
  } catch (error) {
    console.error("[Subscription] Failed to cancel subscription:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to cancel subscription",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
