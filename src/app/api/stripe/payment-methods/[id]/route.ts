import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { stripe } from "@/lib/stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * DELETE /api/stripe/payment-methods/[id]
 * Delete a saved payment method
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id: paymentMethodId } = await params;
    console.log(`🗑️ Deleting payment method: ${paymentMethodId} for user: ${session.user.id}`);

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Find the payment method in user's saved methods
    const paymentMethodIndex = user.savedPaymentMethods.findIndex(
      (pm: Record<string, unknown>) => pm.paymentMethodId === paymentMethodId
    );

    if (paymentMethodIndex === -1) {
      return NextResponse.json({ error: "Payment method not found" }, { status: 404 });
    }

    // Detach payment method from Stripe customer
    try {
      await stripe.paymentMethods.detach(paymentMethodId);
    } catch (stripeError) {
      console.warn(`Warning: Could not detach payment method from Stripe: ${stripeError}`);
      // Continue with deletion even if Stripe detachment fails
    }

    // Remove from user's saved payment methods
    user.savedPaymentMethods.splice(paymentMethodIndex, 1);

    await user.save();

    console.log(`✅ Payment method deleted successfully: ${paymentMethodId}`);

    return NextResponse.json({
      success: true,
      message: "Payment method deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting payment method:", error);
    return NextResponse.json({ success: false, error: "Failed to delete payment method" }, { status: 500 });
  }
}
