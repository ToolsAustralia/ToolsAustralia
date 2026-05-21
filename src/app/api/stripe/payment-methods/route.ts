import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  savePaymentMethodToUser,
  deduplicatePaymentMethods,
  getStripeSubscriptionDefaultPaymentMethodId,
} from "@/utils/payment/payment-method-manager";

const savePaymentMethodSchema = z.object({
  paymentMethodId: z.string().min(1, "Payment method ID is required"),
  setAsDefault: z.boolean().optional().default(false),
});

/**
 * GET /api/stripe/payment-methods
 * Get user's saved payment methods
 */
export async function GET() {
  try {
    await connectDB();

    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const uniquePaymentMethodsMap = new Map<string, Record<string, unknown>>();
    for (const pm of user.savedPaymentMethods || []) {
      const pmId = pm.paymentMethodId as string;
      if (pmId && !uniquePaymentMethodsMap.has(pmId)) {
        uniquePaymentMethodsMap.set(pmId, pm);
      }
    }
    const uniquePaymentMethods = Array.from(uniquePaymentMethodsMap.values());

    const stripeCards = user.stripeCustomerId
      ? await stripe.paymentMethods.list({
          customer: user.stripeCustomerId,
          type: "card",
          limit: 20,
        })
      : { data: [] as Stripe.PaymentMethod[] };

    const cardById = new Map(stripeCards.data.map((c) => [c.id, c]));

    const paymentMethodsWithDetails = uniquePaymentMethods.map((pm: Record<string, unknown>) => {
      const pmId = pm.paymentMethodId as string;
      try {
        if (typeof pmId === "string" && pmId.startsWith("pm_test_")) {
          return {
            paymentMethodId: pmId,
            isDefault: pm.isDefault,
            createdAt: pm.createdAt,
            lastUsed: pm.lastUsed,
            card: {
              brand: "visa",
              last4: "4242",
              expMonth: 12,
              expYear: 2025,
            },
          };
        }

        const stripePm = cardById.get(pmId);
        return {
          paymentMethodId: pmId,
          isDefault: pm.isDefault,
          createdAt: pm.createdAt,
          lastUsed: pm.lastUsed,
          card:
            stripePm?.type === "card" && stripePm.card
              ? {
                  brand: stripePm.card.brand || "",
                  last4: stripePm.card.last4 || "",
                  expMonth: stripePm.card.exp_month || 0,
                  expYear: stripePm.card.exp_year || 0,
                }
              : undefined,
        };
      } catch {
        return {
          paymentMethodId: pmId,
          isDefault: pm.isDefault,
          createdAt: pm.createdAt,
          lastUsed: pm.lastUsed,
        };
      }
    });

    let subscriptionDefaultPaymentMethodId: string | null = null;
    if (user.subscription?.isActive && user.stripeSubscriptionId) {
      subscriptionDefaultPaymentMethodId = await getStripeSubscriptionDefaultPaymentMethodId(
        user.stripeSubscriptionId
      );
    }

    return NextResponse.json(
      {
        success: true,
        paymentMethods: paymentMethodsWithDetails,
        subscriptionDefaultPaymentMethodId,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=10",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching payment methods:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch payment methods" }, { status: 500 });
  }
}

/**
 * POST /api/stripe/payment-methods
 * Save a new payment method for the user
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
    const { paymentMethodId, setAsDefault } = savePaymentMethodSchema.parse(body);

    // console.log(`💳 Saving payment method for user: ${session.user.id}`);

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Ensure user has a Stripe customer ID
    if (!user.stripeCustomerId) {
      return NextResponse.json({ error: "User does not have a Stripe customer ID" }, { status: 400 });
    }

    // Retrieve payment method from Stripe
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    if (!paymentMethod) {
      return NextResponse.json({ error: "Payment method not found" }, { status: 404 });
    }

    // ✅ FIX: Use savePaymentMethodToUser utility instead of direct push
    // This ensures duplicate checking and proper idempotency
    const saveResult = await savePaymentMethodToUser(user, paymentMethodId, {
      setAsDefault: setAsDefault,
    });

    if (!saveResult.success) {
      return NextResponse.json(
        { success: false, error: saveResult.error || "Failed to save payment method" },
        { status: 500 }
      );
    }

    // Refresh user to get updated payment methods
    const updatedUser = await User.findById(user._id);
    if (!updatedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Find the saved payment method to return in response
    const savedPaymentMethod = updatedUser.savedPaymentMethods?.find(
      (pm) => pm.paymentMethodId === paymentMethodId
    );

    if (!savedPaymentMethod) {
      return NextResponse.json(
        { success: false, error: "Payment method was not saved correctly" },
        { status: 500 }
      );
    }

    await deduplicatePaymentMethods(updatedUser);

    // Fetch card details from Stripe for response
    let cardDetails;
    try {
      const stripePaymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (stripePaymentMethod.type === "card") {
        cardDetails = {
          brand: stripePaymentMethod.card?.brand || "",
          last4: stripePaymentMethod.card?.last4 || "",
          expMonth: stripePaymentMethod.card?.exp_month || 0,
          expYear: stripePaymentMethod.card?.exp_year || 0,
        };
      }
    } catch (error) {
      console.warn("Could not fetch payment method details for response:", error);
    }

    // console.log(`✅ Payment method saved successfully: ${paymentMethodId}`);

    return NextResponse.json({
      success: true,
      paymentMethod: {
        paymentMethodId: savedPaymentMethod.paymentMethodId,
        isDefault: savedPaymentMethod.isDefault,
        createdAt: savedPaymentMethod.createdAt,
        lastUsed: savedPaymentMethod.lastUsed,
        ...(cardDetails && { card: cardDetails }),
      },
      message: saveResult.wasNew
        ? "Payment method saved successfully"
        : "Payment method already exists, updated successfully",
    });
  } catch (error) {
    console.error("Error saving payment method:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: false, error: "Failed to save payment method" }, { status: 500 });
  }
}
