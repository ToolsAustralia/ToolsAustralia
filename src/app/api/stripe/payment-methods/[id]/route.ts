import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { detachAndRemoveSavedPaymentMethod } from "@/utils/payment/payment-method-manager";

/**
 * DELETE /api/stripe/payment-methods/[id]
 * Delete a saved payment method (detaches in Stripe; keeps subscription/customer defaults consistent).
 *
 * Query: confirmBillingRisk=1 — required when removing the only saved method that bills an active subscription.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id: paymentMethodId } = await params;
    const confirmBillingRisk =
      request.nextUrl.searchParams.get("confirmBillingRisk") === "1" ||
      request.nextUrl.searchParams.get("confirmBillingRisk") === "true";

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const result = await detachAndRemoveSavedPaymentMethod(user, paymentMethodId, {
      confirmBillingRisk,
    });

    if (!result.success) {
      if (result.code === "REQUIRES_BILLING_RISK_CONFIRMATION") {
        return NextResponse.json(
          {
            success: false,
            error: result.error,
            code: result.code,
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { success: false, error: result.error || "Failed to delete payment method" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Payment method deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting payment method:", error);
    return NextResponse.json({ success: false, error: "Failed to delete payment method" }, { status: 500 });
  }
}
