import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import mongoose from "mongoose";
import { z } from "zod";
import {
  cancelSubscription,
  isSubscriptionReferenceError,
  SUBSCRIPTION_REFERENCE_ERROR_CODES,
} from "@/services/subscription";

const cancelSubscriptionSchema = z.object({
  cancelAtPeriodEnd: z.boolean().optional().default(true),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/users/[id]/cancel-subscription
 * Cancel a user's Stripe subscription (admin only).
 *
 * @see docs/ADMIN_CANCEL_SUBSCRIPTION.md
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();

    const guard = await requirePermission("users.edit");
    if (guard instanceof NextResponse) return guard;
    const { session } = guard;

    const { id: userId } = await params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is ok - will use defaults
    }

    const validatedData = cancelSubscriptionSchema.parse(body);

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.stripeSubscriptionId && !user.stripeCustomerId) {
      return NextResponse.json(
        { error: "User has no Stripe subscription to cancel", code: SUBSCRIPTION_REFERENCE_ERROR_CODES.NO_ACTIVE_SUBSCRIPTION },
        { status: 400 }
      );
    }

    const result = await cancelSubscription(user, {
      cancelAtPeriodEnd: validatedData.cancelAtPeriodEnd,
      analytics: {
        actor: "admin",
        adminUserId: session.user.id,
      },
    });

    const message = result.cancelledImmediately
      ? result.isPastDue
        ? "Subscription canceled successfully. The subscription had already failed payment."
        : "Subscription canceled successfully."
      : "Subscription will be canceled at the end of the current billing period.";

    return NextResponse.json({
      success: true,
      message,
      data: result,
    });
  } catch (error) {
    console.error("❌ Admin cancel subscription error:", error);

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
            error: "Stripe temporarily unavailable. Please try again in a moment.",
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
