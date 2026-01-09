import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { stripe } from "@/lib/stripe";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { savePaymentMethodToUser, deduplicatePaymentMethods } from "@/utils/payment/payment-method-manager";

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

    let user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ✅ SAFETY NET: Deduplicate payment methods before processing
    // This ensures API always returns unique payment methods even if database has duplicates
    const dedupeResult = await deduplicatePaymentMethods(user);
    if (dedupeResult.success && dedupeResult.duplicatesRemoved > 0) {
      // Refresh user to get deduplicated payment methods
      const refreshedUser = await User.findById(user._id);
      if (refreshedUser) {
        user = refreshedUser;
      }
    }

    // ✅ Additional client-side deduplication as final safety net
    // Use Map to ensure unique paymentMethodIds before fetching Stripe details
    const uniquePaymentMethodsMap = new Map<string, Record<string, unknown>>();
    for (const pm of user.savedPaymentMethods || []) {
      const pmId = pm.paymentMethodId as string;
      if (pmId && !uniquePaymentMethodsMap.has(pmId)) {
        uniquePaymentMethodsMap.set(pmId, pm);
      }
    }
    const uniquePaymentMethods = Array.from(uniquePaymentMethodsMap.values());

    // PCI-COMPLIANT: Fetch card details from Stripe when needed for display
    // We only store payment method IDs in our database, card details come from Stripe
    const paymentMethodsWithDetails = await Promise.all(
      uniquePaymentMethods.map(async (pm: Record<string, unknown>) => {
        try {
          // For test payment methods, return mock data
          if (typeof pm.paymentMethodId === "string" && pm.paymentMethodId.startsWith("pm_test_")) {
            return {
              paymentMethodId: pm.paymentMethodId,
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

          // For real payment methods, fetch details from Stripe
          const stripePaymentMethod = await stripe.paymentMethods.retrieve(pm.paymentMethodId as string);
          return {
            paymentMethodId: pm.paymentMethodId,
            isDefault: pm.isDefault,
            createdAt: pm.createdAt,
            lastUsed: pm.lastUsed,
            card:
              stripePaymentMethod.type === "card"
                ? {
                    brand: stripePaymentMethod.card?.brand || "",
                    last4: stripePaymentMethod.card?.last4 || "",
                    expMonth: stripePaymentMethod.card?.exp_month || 0,
                    expYear: stripePaymentMethod.card?.exp_year || 0,
                  }
                : undefined,
          };
        } catch (error) {
          // console.warn(`Could not fetch payment method details for ${pm.paymentMethodId}:`, error);
          // Return basic info without card details if Stripe fetch fails
          return {
            paymentMethodId: pm.paymentMethodId,
            isDefault: pm.isDefault,
            createdAt: pm.createdAt,
            lastUsed: pm.lastUsed,
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      paymentMethods: paymentMethodsWithDetails,
    });
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
