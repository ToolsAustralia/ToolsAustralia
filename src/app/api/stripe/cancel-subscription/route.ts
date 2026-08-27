import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  cancelSubscription,
  isSubscriptionReferenceError,
  SUBSCRIPTION_REFERENCE_ERROR_CODES,
} from "@/services/subscription";

const cancelSubscriptionSchema = z.object({
  cancelAtPeriodEnd: z.boolean().optional().default(true), // Cancel at end of billing period by default
});

/**
 * POST /api/stripe/cancel-subscription
 * Cancel a user's Stripe subscription (user-facing, session-scoped)
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = cancelSubscriptionSchema.parse(body);

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.stripeSubscriptionId && !user.stripeCustomerId) {
      return NextResponse.json(
        { error: "No active subscription found", code: SUBSCRIPTION_REFERENCE_ERROR_CODES.NO_ACTIVE_SUBSCRIPTION },
        { status: 400 }
      );
    }

    const result = await cancelSubscription(user, {
      cancelAtPeriodEnd: validatedData.cancelAtPeriodEnd,
      analytics: { actor: "user" },
      // Only the member-initiated cancel is churn. The admin cancel route and the
      // past-due tier switch leave this off (default false). Gates the cancel-time
      // "Subscription Cancellation Requested" Klaviyo emit that starts the win-back flow.
      isMemberChurn: true,
    });

    const message = result.cancelledImmediately
      ? result.isPastDue
        ? "Subscription canceled successfully. Your subscription had already failed payment."
        : "Subscription canceled successfully"
      : "Subscription will be canceled at the end of your current billing period";

    return NextResponse.json({
      success: true,
      message,
      data: {
        subscriptionId: result.subscriptionId,
        status: result.status,
        cancelAtPeriodEnd: result.cancelAtPeriodEnd,
        currentPeriodEnd: result.currentPeriodEnd,
        endDate: result.endDate,
        cancelledImmediately: result.cancelledImmediately,
        isPastDue: result.isPastDue,
      },
    });
  } catch (error) {
    console.error("❌ Error canceling subscription:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }

    if (isSubscriptionReferenceError(error)) {
      if (error.code === SUBSCRIPTION_REFERENCE_ERROR_CODES.NO_ACTIVE_SUBSCRIPTION) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
      }
      if (error.code === SUBSCRIPTION_REFERENCE_ERROR_CODES.STRIPE_RETRYABLE) {
        return NextResponse.json(
          {
            error: "Payment provider temporarily unavailable. Please try again.",
            code: error.code,
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to cancel subscription. Please try again or contact support.",
      },
      { status: 500 }
    );
  }
}
