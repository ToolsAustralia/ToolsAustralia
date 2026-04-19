import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { stripe } from "@/lib/stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * GET /api/stripe/payment-intent/[id]/payment-method
 * Auth + ownership: PI.customer must match user's stripeCustomerId.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id: paymentIntentId } = await context.params;
    if (!paymentIntentId?.startsWith("pi_")) {
      return NextResponse.json({ error: "Invalid payment intent id" }, { status: 400 });
    }

    const user = await User.findById(session.user.id);
    if (!user?.stripeCustomerId) {
      return NextResponse.json({ error: "User has no Stripe customer" }, { status: 400 });
    }

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["payment_method"],
    });

    const piCustomer =
      typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? null;
    if (!piCustomer || piCustomer !== user.stripeCustomerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const pm = pi.payment_method as import("stripe").Stripe.PaymentMethod | null;
    const card = pm?.type === "card" ? pm.card : null;

    return NextResponse.json(
      {
        success: true,
        paymentMethodId: pm?.id ?? null,
        card: card
          ? {
              brand: card.brand ?? "",
              last4: card.last4 ?? "",
            }
          : null,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    console.error("payment-intent payment-method GET:", error);
    return NextResponse.json({ success: false, error: "Failed to load payment method" }, { status: 500 });
  }
}
