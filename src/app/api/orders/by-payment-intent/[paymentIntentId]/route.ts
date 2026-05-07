// src/app/api/orders/by-payment-intent/[paymentIntentId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Order from "@/models/Order";
import { stripe } from "@/lib/stripe";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ paymentIntentId: string }> },
) {
  try {
    await connectDB();
    const { paymentIntentId } = await params;

    const order = await Order.findOne({ paymentIntentId }).lean();
    if (order) {
      return NextResponse.json({ status: "ready", order });
    }

    // No Order yet — check PI status
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    return NextResponse.json({
      status: "pending",
      paymentIntentStatus: pi.status,
    });
  } catch (err) {
    console.error("[shop] by-payment-intent failed", err);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
