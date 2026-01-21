import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

/**
 * GET /api/stripe/verify-payment-intent
 * Lightweight endpoint to verify PaymentIntent status without confirming
 * Used by frontend to check if PaymentIntent is already succeeded before skipping backend confirmation
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const paymentIntentId = searchParams.get("paymentIntentId");
    
    if (!paymentIntentId) {
      return NextResponse.json(
        { error: "PaymentIntent ID required" },
        { status: 400 }
      );
    }
    
    console.log(`[verify-payment-intent] Verifying PaymentIntent ${paymentIntentId}`);
    
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    console.log(`[verify-payment-intent] PaymentIntent ${paymentIntentId} status: ${pi.status}`);
    
    return NextResponse.json({ 
      status: pi.status,
      id: pi.id,
      amount: pi.amount,
      currency: pi.currency,
    });
  } catch (error) {
    console.error(`[verify-payment-intent] Error verifying PaymentIntent: ${error}`);
    
    return NextResponse.json(
      {
        error: "Failed to verify PaymentIntent",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
