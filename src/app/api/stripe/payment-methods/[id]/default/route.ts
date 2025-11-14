import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

/**
 * PUT /api/stripe/payment-methods/[id]/default
 * Set a payment method as default
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id: paymentMethodId } = await params;
    console.log(`⭐ Setting payment method as default: ${paymentMethodId} for user: ${session.user.id}`);

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.stripeCustomerId) {
      return NextResponse.json({ error: "User does not have a Stripe customer ID" }, { status: 400 });
    }

    // Find the payment method in user's saved methods
    const paymentMethod = user.savedPaymentMethods.find(
      (pm: Record<string, unknown>) => pm.paymentMethodId === paymentMethodId
    );

    if (!paymentMethod) {
      return NextResponse.json({ error: "Payment method not found" }, { status: 404 });
    }

    // Remove default from all other payment methods
    user.savedPaymentMethods.forEach((pm: Record<string, unknown>) => {
      pm.isDefault = false;
    });

    // Set the selected payment method as default
    paymentMethod.isDefault = true;
    paymentMethod.lastUsed = new Date();

    const paymentMethodRecord = paymentMethod as {
      paymentMethodId: string;
      isDefault: boolean;
      createdAt: Date;
      lastUsed?: Date;
      card?: {
        brand?: string;
        last4?: string;
        expMonth?: number;
        expYear?: number;
      };
    };

    // Sync with Stripe so invoicing/subscriptions use the same default
    try {
      await stripe.customers.update(user.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
    } catch (error) {
      console.error("Stripe customer update failed:", error);
      return NextResponse.json(
        { success: false, error: "Failed to update Stripe default payment method" },
        { status: 502 }
      );
    }

    await user.save();

    console.log(`✅ Payment method set as default successfully: ${paymentMethodId}`);

    return NextResponse.json({
      success: true,
      data: {
        paymentMethodId,
        isDefault: true,
        createdAt: paymentMethodRecord.createdAt,
        lastUsed: paymentMethodRecord.lastUsed,
        card: paymentMethodRecord.card,
      },
    });
  } catch (error) {
    console.error("Error setting default payment method:", error);
    return NextResponse.json({ success: false, error: "Failed to set default payment method" }, { status: 500 });
  }
}
