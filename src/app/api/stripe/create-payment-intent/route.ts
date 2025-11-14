import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { z } from "zod";

const createPaymentIntentSchema = z.object({
  subscriptionId: z.string().min(1, "Subscription ID is required"),
});

/**
 * POST /api/stripe/create-payment-intent
 * Create a payment intent for an existing subscription
 */
export async function POST(request: NextRequest) {
  try {
    console.log("💳 Creating payment intent for subscription...");

    const body = await request.json();
    const { subscriptionId } = createPaymentIntentSchema.parse(body);

    console.log(`📋 Creating payment intent for subscription: ${subscriptionId}`);

    // Retrieve the subscription to get the customer and price
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price", "customer"],
    });

    if (!subscription) {
      return NextResponse.json(
        {
          success: false,
          error: "Subscription not found",
        },
        { status: 404 }
      );
    }

    // Get the first item's price
    const price = subscription.items.data[0]?.price;
    if (!price) {
      return NextResponse.json(
        {
          success: false,
          error: "No price found for subscription",
        },
        { status: 400 }
      );
    }

    // Get subscription metadata to create meaningful description
    const subscriptionMetadata = subscription.metadata || {};
    const description = subscriptionMetadata.description || subscriptionMetadata.packageName || "Subscription Payment";

    // Create a payment intent for the subscription amount
    const paymentIntent = await stripe.paymentIntents.create({
      amount: price.unit_amount || 0,
      currency: price.currency || "usd",
      customer: subscription.customer as string,
      description: description, // Use description from subscription metadata
      metadata: {
        subscriptionId: subscriptionId,
        type: "subscription_payment",
      },
    });

    console.log(`✅ Created payment intent: ${paymentIntent.id}`);

    return NextResponse.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("❌ Payment intent creation failed:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to create payment intent",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
