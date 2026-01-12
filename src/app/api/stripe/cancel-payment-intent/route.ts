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

    // ✅ ENHANCED: Check all cancellable states
    const cancellableStates = [
      "requires_payment_method",
      "requires_confirmation", 
      "requires_action",
      "requires_capture" // Manual capture - can cancel before capture
    ];

    if (cancellableStates.includes(paymentIntent.status)) {
      try {
        const cancelledPaymentIntent = await stripe.paymentIntents.cancel(paymentIntentId);
        console.log(`✅ Cancelled PaymentIntent ${paymentIntentId} - status: ${cancelledPaymentIntent.status}`);

        return NextResponse.json({
          success: true,
          paymentIntentId: cancelledPaymentIntent.id,
          status: cancelledPaymentIntent.status,
        });
      } catch (cancelError: unknown) {
        // Handle race condition: PaymentIntent might have been canceled by another request
        const stripeError = cancelError as { code?: string; raw?: { payment_intent?: { status?: string } } };
        if (stripeError?.code === 'payment_intent_unexpected_state') {
          // Re-check status - it might be canceled now
          const updatedPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
          if (updatedPaymentIntent.status === "canceled") {
            console.log(`ℹ️ PaymentIntent ${paymentIntentId} was already cancelled by another request`);
            return NextResponse.json({
              success: true,
              paymentIntentId: paymentIntentId,
              status: 'canceled',
              message: "Already cancelled by another request",
            });
          }
        }
        throw cancelError; // Re-throw other errors
      }
    } else if (paymentIntent.status === "succeeded") {
      // PaymentIntent already succeeded - cannot cancel
      console.warn(`⚠️ PaymentIntent ${paymentIntentId} already succeeded - cannot cancel (double charge attempt detected)`);
      return NextResponse.json(
        {
          success: false,
          error: "PaymentIntent already succeeded - cannot cancel",
          status: paymentIntent.status,
          warning: "Double charge attempt detected",
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











