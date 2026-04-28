import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import mongoose from "mongoose";
import { z } from "zod";
import { cancelSubscription } from "@/services/subscription";

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

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    if (!user.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "User has no Stripe subscription to cancel" },
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

    if (error instanceof Error && error.message === "No active subscription found") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "Failed to cancel subscription. Please try again or contact support.",
      },
      { status: 500 }
    );
  }
}
