import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  abandonPastDueForTierSwitch,
  NotPastDueError,
  SubscriptionRecoveredError,
} from "@/services/subscription/switchTierPastDue";
import {
  isSubscriptionReferenceError,
  SUBSCRIPTION_REFERENCE_ERROR_CODES,
} from "@/services/subscription";

/**
 * POST /api/stripe/switch-tier-past-due
 *
 * Teardown step of the past-due tier switch: cancels the caller's past-due subscription
 * immediately and voids (forgives) its open renewal invoice(s). The client then opens the
 * ordinary fresh-subscribe flow for the new tier. No body — the teardown is target-agnostic;
 * the client enforces "different tier" (a same-tier tap resolves payment instead). The service
 * reconciles against live Stripe status: it refuses to cancel a sub Stripe already recovered
 * (409 SUBSCRIPTION_RECOVERED) and no-ops an already-canceled one (idempotent retry).
 */
export async function POST() {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Allow past_due (the normal case) and canceled (an idempotent retry after a prior teardown —
    // e.g. the first POST's response was lost). The service reconciles against LIVE Stripe status and
    // no-ops an already-canceled/recovered sub, so the destructive cancel only fires for a live past_due.
    const localStatus = user.subscription?.status;
    if (localStatus !== "past_due" && localStatus !== "canceled") {
      return NextResponse.json(
        { error: "Subscription is not past due", code: "NOT_PAST_DUE" },
        { status: 409 }
      );
    }

    const result = await abandonPastDueForTierSwitch(user);

    return NextResponse.json({
      success: true,
      message: "Past-due membership closed. You can now start your new tier.",
      data: result,
    });
  } catch (error) {
    console.error("❌ Error switching tier for past-due subscription:", error);

    // Recovered-race: Stripe already put the sub back to active — surface the friendly message so the
    // client can refresh instead of retrying the (now-refused) teardown.
    if (error instanceof NotPastDueError || error instanceof SubscriptionRecoveredError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }

    if (isSubscriptionReferenceError(error)) {
      if (error.code === SUBSCRIPTION_REFERENCE_ERROR_CODES.NO_ACTIVE_SUBSCRIPTION) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
      }
      if (error.code === SUBSCRIPTION_REFERENCE_ERROR_CODES.STRIPE_RETRYABLE) {
        return NextResponse.json(
          { error: "Payment provider temporarily unavailable. Please try again.", code: error.code },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to switch tier. Please try again or contact support." },
      { status: 500 }
    );
  }
}
