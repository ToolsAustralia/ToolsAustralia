import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { klaviyo } from "@/lib/klaviyo";
import { ensureUserProfileSynced } from "@/utils/integrations/klaviyo/klaviyo-profile-sync";
import { createSubscriptionCancelledEvent } from "@/utils/integrations/klaviyo/klaviyo-events";
import { handleSubscriptionQueueUpdate } from "@/utils/partner-discounts/partner-discount-queue";

// Extended Stripe subscription interface to include current_period_end
interface StripeSubscriptionWithPeriodEnd {
  id: string;
  status: string;
  current_period_end: number;
  cancel_at_period_end: boolean;
}

const cancelSubscriptionSchema = z.object({
  cancelAtPeriodEnd: z.boolean().optional().default(true), // Cancel at end of billing period by default
});

/**
 * POST /api/stripe/cancel-subscription
 * Cancel a user's Stripe subscription
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
    const validatedData = cancelSubscriptionSchema.parse(body);

    console.log(`🚫 Canceling subscription for user: ${session.user.id}`);

    // Get the user
    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user has an active subscription
    if (!user.stripeSubscriptionId) {
      return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
    }

    // Cancel the subscription in Stripe
    let canceledSubscription: Stripe.Subscription;
    if (validatedData.cancelAtPeriodEnd) {
      // Cancel at the end of the current billing period (user keeps access until then)
      canceledSubscription = (await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: true,
      })) as Stripe.Subscription;
      console.log(`✅ Subscription set to cancel at period end: ${user.stripeSubscriptionId}`);
    } else {
      // Cancel immediately
      canceledSubscription = (await stripe.subscriptions.cancel(user.stripeSubscriptionId)) as Stripe.Subscription;
      console.log(`✅ Subscription canceled immediately: ${user.stripeSubscriptionId}`);
    }

    // Debug: Log subscription details
    console.log("📊 Subscription details:", {
      id: canceledSubscription.id,
      status: canceledSubscription.status,
      current_period_end: (canceledSubscription as unknown as StripeSubscriptionWithPeriodEnd).current_period_end,
      cancel_at_period_end: canceledSubscription.cancel_at_period_end,
    });

    const latestSubscription = (await stripe.subscriptions.retrieve(user.stripeSubscriptionId)) as Stripe.Subscription;

    const getCurrentPeriodEnd = (subscription?: Stripe.Subscription): number | undefined => {
      if (!subscription) return undefined;
      const withPeriod = subscription as Partial<StripeSubscriptionWithPeriodEnd>;
      return typeof withPeriod.current_period_end === "number" ? withPeriod.current_period_end : undefined;
    };

    const getCancelAt = (subscription?: Stripe.Subscription): number | undefined => {
      if (!subscription) return undefined;
      return typeof subscription.cancel_at === "number" ? subscription.cancel_at : undefined;
    };

    const resolveTimestamp = (...timestamps: Array<number | undefined>) =>
      timestamps.find((value) => typeof value === "number");

    const resolvedEndTimestamp = resolveTimestamp(
      getCurrentPeriodEnd(canceledSubscription),
      getCurrentPeriodEnd(latestSubscription),
      getCancelAt(latestSubscription),
      getCancelAt(canceledSubscription)
    );

    const stripeEndDate = resolvedEndTimestamp ? new Date(resolvedEndTimestamp * 1000) : null;

    console.log("📅 Resolved subscription period end:", {
      canceledCurrentPeriodEnd: getCurrentPeriodEnd(canceledSubscription),
      latestCurrentPeriodEnd: getCurrentPeriodEnd(latestSubscription),
      latestCancelAt: getCancelAt(latestSubscription),
      resolvedEndTimestamp,
      stripeEndDate,
      cancelAtPeriodEnd: validatedData.cancelAtPeriodEnd,
    });

    // Update user's subscription status in database
    if (user.subscription) {
      user.subscription.autoRenew = false;
      if (!validatedData.cancelAtPeriodEnd) {
        user.subscription.isActive = false;
        user.subscription.endDate = new Date();
      } else if (stripeEndDate) {
        user.subscription.endDate = stripeEndDate;
      }
    }

    // Update partner discount queue - subscription will end
    // This will mark the subscription period as expired and activate the next queued item
    if (!validatedData.cancelAtPeriodEnd) {
      // If canceled immediately, end subscription in queue now
      console.log(`🎁 Ending subscription in partner discount queue immediately`);
      await handleSubscriptionQueueUpdate(user as unknown as import("@/models/User").IUser, "end");
    }
    // If canceling at period end, the queue will be processed automatically by the cron job
    // when the subscription actually ends (when current_period_end is reached)

    await user.save();

    // ✅ Track subscription cancellation in Klaviyo (non-blocking)
    try {
      console.log(`📊 Tracking subscription cancellation in Klaviyo for: ${user.email}`);
      klaviyo.trackEventBackground(
        createSubscriptionCancelledEvent(user, {
          packageId: user.subscription?.packageId || "unknown",
          packageName: "Subscription",
          tier: user.subscription?.packageId || "unknown",
        })
      );
      console.log(`✅ Klaviyo subscription cancellation event tracked`);
    } catch (klaviyoError) {
      console.error("❌ Klaviyo subscription cancellation event tracking failed:", klaviyoError);
    }

    // ✅ Sync user profile to Klaviyo with updated subscription status (non-blocking)
    try {
      console.log(`📊 Syncing user profile to Klaviyo after subscription cancellation`);
      ensureUserProfileSynced(user);
      console.log(`✅ Klaviyo profile sync initiated after cancellation`);
    } catch (klaviyoError) {
      console.error("❌ Klaviyo profile sync failed after cancellation:", klaviyoError);
    }

    const responseEndDate =
      validatedData.cancelAtPeriodEnd && stripeEndDate ? stripeEndDate : user.subscription?.endDate ?? null;

    return NextResponse.json({
      success: true,
      message: validatedData.cancelAtPeriodEnd
        ? "Subscription will be canceled at the end of your current billing period"
        : "Subscription canceled successfully",
      data: {
        subscriptionId: canceledSubscription.id,
        status: canceledSubscription.status,
        cancelAtPeriodEnd: canceledSubscription.cancel_at_period_end,
        currentPeriodEnd: responseEndDate ? responseEndDate.toISOString() : null,
        endDate: user.subscription?.endDate ? user.subscription.endDate.toISOString() : null,
      },
    });
  } catch (error) {
    console.error("❌ Error canceling subscription:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "Failed to cancel subscription. Please try again or contact support.",
      },
      { status: 500 }
    );
  }
}
