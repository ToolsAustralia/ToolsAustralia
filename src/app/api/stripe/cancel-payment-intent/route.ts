import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil",
});

/**
 * POST /api/stripe/cancel-payment-intent
 * Cancel a PaymentIntent (used for upfront PaymentIntents in subscriptions)
 * This prevents double charging - upfront PaymentIntent is only for wallet display
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { paymentIntentId } = body;

    if (!paymentIntentId || typeof paymentIntentId !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "PaymentIntent ID is required",
        },
        { status: 400 }
      );
    }

    // Retrieve the PaymentIntent to check its status
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Only cancel if it's still in a cancellable state
    // ✅ CRITICAL: For manual capture PaymentIntents, they'll be in "requires_capture" status after confirmation
    // This gives us time to cancel them before they're captured and charged
    if (
      paymentIntent.status === "requires_payment_method" ||
      paymentIntent.status === "requires_confirmation" ||
      paymentIntent.status === "requires_action" ||
      paymentIntent.status === "requires_capture" // ✅ NEW: Can cancel manual capture PaymentIntents
    ) {
      const cancelledPaymentIntent = await stripe.paymentIntents.cancel(paymentIntentId);
      console.log(`✅ Cancelled PaymentIntent ${paymentIntentId} - status: ${cancelledPaymentIntent.status}`);

      return NextResponse.json({
        success: true,
        paymentIntentId: cancelledPaymentIntent.id,
        status: cancelledPaymentIntent.status,
      });
    } else if (paymentIntent.status === "succeeded") {
      // PaymentIntent already succeeded - cannot cancel
      console.warn(`⚠️ PaymentIntent ${paymentIntentId} already succeeded - cannot cancel`);
      return NextResponse.json(
        {
          success: false,
          error: "PaymentIntent already succeeded - cannot cancel",
          status: paymentIntent.status,
        },
        { status: 400 }
      );
    } else if (paymentIntent.status === "canceled") {
      // Already cancelled
      console.log(`ℹ️ PaymentIntent ${paymentIntentId} already cancelled`);
      return NextResponse.json({
        success: true,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        message: "Already cancelled",
      });
    } else {
      // Other status (e.g., "processing")
      console.log(`ℹ️ PaymentIntent ${paymentIntentId} is ${paymentIntent.status}, no action needed`);
      return NextResponse.json({
        success: true,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        message: "No action needed",
      });
    }
  } catch (error) {
    console.error("❌ Error cancelling PaymentIntent:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to cancel PaymentIntent",
      },
      { status: 500 }
    );
  }
}

