import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { stripe } from "@/lib/stripe";
import { analyzePaymentIntentForExcessiveRetry } from "@/utils/payment/stripe/stripe-excessive-retry";

const bodySchema = z.object({
  paymentIntentId: z.string().regex(/^pi_/),
});

/**
 * POST /api/stripe/analyze-payment-intent
 * After client-side confirmPayment fails, inspect PI latest_charge.outcome for
 * Stripe excessive-retry block (so UI can prompt for a different card).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    await connectDB();
    const user = await User.findById(session.user.id);
    if (!user?.stripeCustomerId) {
      return NextResponse.json({ error: "No Stripe customer on file" }, { status: 400 });
    }

    const pi = await stripe.paymentIntents.retrieve(parsed.data.paymentIntentId);
    const piCustomer = typeof pi.customer === "string" ? pi.customer : pi.customer?.id;
    if (piCustomer !== user.stripeCustomerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const analysis = await analyzePaymentIntentForExcessiveRetry(stripe, parsed.data.paymentIntentId);

    return NextResponse.json({
      success: true,
      requiresDifferentPaymentMethod: analysis.requiresDifferentPaymentMethod,
      ...(analysis.failureReason && { failureReason: analysis.failureReason }),
    });
  } catch (error) {
    console.error("[analyze-payment-intent]", error);
    return NextResponse.json(
      {
        error: "Failed to analyze payment",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
