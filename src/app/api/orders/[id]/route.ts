import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Order from "@/models/Order";
import { z } from "zod";
import { verify } from "jsonwebtoken";
import { JWTPayload } from "@/types/api";

const paramsSchema = z.object({
  id: z.string().min(1),
});

const updateOrderSchema = z.object({
  status: z.enum(["pending", "processing", "shipped", "delivered", "cancelled"]).optional(),
  trackingNumber: z.string().optional(),
  notes: z.string().optional(),
});

// Helper function to get user from token
async function getUserFromToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("No token provided");
  }

  const token = authHeader.substring(7);
  const decoded = verify(token, process.env.NEXTAUTH_SECRET!) as JWTPayload;
  return decoded.userId;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    const { id } = paramsSchema.parse(await params);
    const userId = await getUserFromToken(request);

    const order = await Order.findOne({ _id: id, user: userId }).populate("products.productId").lean();

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error("Error fetching order:", error);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    const { id } = paramsSchema.parse(await params);
    const userId = await getUserFromToken(request);
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
