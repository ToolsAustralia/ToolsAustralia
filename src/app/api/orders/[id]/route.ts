import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Order from "@/models/Order";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { requireSameOrigin } from "@/utils/security/requireSameOrigin";

// A Mongo ObjectId, not any non-empty string. `Order.findOne({_id: "ORD-2024-001"})`
// throws a CastError, which surfaced as a 500 — the checkout success page's
// placeholder id did exactly that. A malformed id is a 404, not a server fault.
const paramsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Not a valid order id"),
});

const updateOrderSchema = z.object({
  status: z.enum(["pending", "processing", "shipped", "delivered", "cancelled"]).optional(),
  trackingNumber: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    const { id } = paramsSchema.parse(await params);
    const auth = await requireAuthenticatedUser();
    if ("errorResponse" in auth) return auth.errorResponse;
    const userId = auth.session.user.id;

    const order = await Order.findOne({ _id: id, user: userId }).populate("products.product").lean();

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    // A malformed id is the caller's problem, not a server fault. Returning 500
    // here made the success page's placeholder id look like an outage, and the
    // e2e QA watchdog rightly failed the run on it.
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    console.error("Error fetching order:", error);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const csrf = requireSameOrigin(request);
    if (csrf) return csrf;
    await connectDB();

    const { id } = paramsSchema.parse(await params);
    const auth = await requireAuthenticatedUser();
    if ("errorResponse" in auth) return auth.errorResponse;
    const userId = auth.session.user.id;
    const body = await request.json();
    const validatedData = updateOrderSchema.parse(body);

    const order = await Order.findOne({ _id: id, user: userId });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Update order
    if (validatedData.status) order.status = validatedData.status;
    if (validatedData.trackingNumber) order.trackingNumber = validatedData.trackingNumber;
    if (validatedData.notes) order.notes = validatedData.notes;

    await order.save();

    return NextResponse.json({
      message: "Order updated successfully",
      order,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error updating order:", error);
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }
}
