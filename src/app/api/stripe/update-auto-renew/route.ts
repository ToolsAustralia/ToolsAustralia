import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { stripe } from "@/lib/stripe";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Extended Stripe subscription interface to include current_period_end
interface StripeSubscriptionWithPeriodEnd {
  id: string;
  status: string;
  current_period_end: number;
  cancel_at_period_end: boolean;
}

const updateAutoRenewSchema = z.object({
  autoRenew: z.boolean(),
});

/**
 * PATCH /api/stripe/update-auto-renew
 * Update auto-renewal setting for a user's subscription
 */
export async function PATCH(request: NextRequest) {
  try {
    await connectDB();

    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = updateAutoRenewSchema.parse(body);

    console.log(`🔄 Updating auto-renewal for user: ${session.user.id} to ${validatedData.autoRenew}`);

    // Get the user
    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user has an active subscription
    if (!user.stripeSubscriptionId) {
      return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
    }

    // Update the subscription in Stripe
    let updatedSubscription;
    if (validatedData.autoRenew) {
      // Enable auto-renewal (remove cancel_at_period_end if it was set)
      updatedSubscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });
      console.log(`✅ Auto-renewal enabled for subscription: ${user.stripeSubscriptionId}`);
    } else {
      // Disable auto-renewal (set to cancel at period end)
      updatedSubscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      console.log(`✅ Auto-renewal disabled for subscription: ${user.stripeSubscriptionId}`);
    }

    // Update user's subscription status in database
    if (user.subscription) {
      user.subscription.autoRenew = validatedData.autoRenew;
    }

    await user.save();

    // ✅ Update Klaviyo profile with latest subscription data
    try {
      const { ensureUserProfileSynced } = await import("@/utils/integrations/klaviyo/klaviyo-profile-sync");
      console.log(`📊 Updating Klaviyo profile after auto-renewal setting change`);
      ensureUserProfileSynced(user);
    } catch (klaviyoError) {
      console.error("Klaviyo profile sync error (non-critical):", klaviyoError);
    }

    return NextResponse.json({
      success: true,
      message: validatedData.autoRenew ? "Auto-renewal enabled successfully" : "Auto-renewal disabled successfully",
      data: {
        subscriptionId: updatedSubscription.id,
        status: updatedSubscription.status,
        autoRenew: validatedData.autoRenew,
        cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
        currentPeriodEnd: (() => {
          const periodEndTimestamp = (updatedSubscription as unknown as StripeSubscriptionWithPeriodEnd)
            .current_period_end;
          if (periodEndTimestamp && typeof periodEndTimestamp === "number") {
            return new Date(periodEndTimestamp * 1000).toISOString();
          }
          return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        })(),
      },
    });
  } catch (error) {
    console.error("❌ Error updating auto-renewal:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "Failed to update auto-renewal setting. Please try again or contact support.",
      },
      { status: 500 }
    );
  }
}
