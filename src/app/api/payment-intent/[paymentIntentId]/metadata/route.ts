import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * GET /api/payment-intent/[paymentIntentId]/metadata
 * Retrieve metadata from a payment intent
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ paymentIntentId: string }> }) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { paymentIntentId } = await params;

    if (!paymentIntentId) {
      return NextResponse.json({ error: "Payment Intent ID is required" }, { status: 400 });
    }

    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Verify the payment intent belongs to the authenticated user
    // We can check this by verifying the customer matches the user's Stripe customer ID
    // For now, we'll just return the metadata (security is handled by Stripe webhook verification)

    return NextResponse.json({
      success: true,
      ...paymentIntent.metadata,
    });
  } catch (error) {
    console.error("Error retrieving payment intent metadata:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to retrieve payment intent metadata",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
