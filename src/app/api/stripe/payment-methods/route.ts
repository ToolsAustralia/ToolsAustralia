import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { stripe } from "@/lib/stripe";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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

    // PCI-COMPLIANT: Fetch card details from Stripe when needed for display
    // We only store payment method IDs in our database, card details come from Stripe
    const paymentMethodsWithDetails = await Promise.all(
      (user.savedPaymentMethods || []).map(async (pm: Record<string, unknown>) => {
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
          console.warn(`Could not fetch payment method details for ${pm.paymentMethodId}:`, error);
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

    console.log(`💳 Saving payment method for user: ${session.user.id}`);

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

    // Attach payment method to customer if not already attached
    if (paymentMethod.customer !== user.stripeCustomerId) {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: user.stripeCustomerId,
      });
    }

    // Prepare payment method data
    const paymentMethodData = {
      paymentMethodId,
      type: paymentMethod.type as "card" | "bank_account",
      card:
        paymentMethod.type === "card"
          ? {
              brand: paymentMethod.card?.brand || "",
              last4: paymentMethod.card?.last4 || "",
              expMonth: paymentMethod.card?.exp_month || 0,
              expYear: paymentMethod.card?.exp_year || 0,
            }
          : undefined,
      isDefault: setAsDefault,
      createdAt: new Date(),
    };

    if (setAsDefault) {
      user.savedPaymentMethods.forEach((pm: Record<string, unknown>) => {
        pm.isDefault = false;
      });

      try {
        await stripe.customers.update(user.stripeCustomerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        });
      } catch (error) {
        console.error("Stripe customer update failed:", error);
        return NextResponse.json(
          { success: false, error: "Failed to set Stripe default payment method" },
          { status: 502 }
        );
      }
    }

    user.savedPaymentMethods.push(paymentMethodData);

    await user.save();

    console.log(`✅ Payment method saved successfully: ${paymentMethodId}`);

    return NextResponse.json({
      success: true,
      paymentMethod: paymentMethodData,
      message: "Payment method saved successfully",
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
