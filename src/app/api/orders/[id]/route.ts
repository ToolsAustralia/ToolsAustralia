import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Order from "@/models/Order";
import { z } from "zod";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const paramsSchema = z.object({
  id: z.string().min(1),
});

const updateOrderSchema = z.object({
  status: z.enum(["pending", "processing", "shipped", "delivered", "cancelled"]).optional(),
  trackingNumber: z.string().optional(),
  notes: z.string().optional(),
});

async function requireSessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    const { id } = paramsSchema.parse(await params);
    const userId = await requireSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Accept either Mongo _id or human-readable orderNumber.
    // The /my-account/orders/[orderNumber] page passes the order number.
    const orFilter: mongoose.FilterQuery<typeof Order>[] = [{ orderNumber: id }];
    if (mongoose.isValidObjectId(id)) orFilter.push({ _id: id });

    const order = await Order.findOne({
      $and: [{ $or: orFilter }, { user: userId }],
    })
      .populate("products.product")
      .lean();

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
    const userId = await requireSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const validatedData = updateOrderSchema.parse(body);

    const order = await Order.findOne({ _id: id, user: userId });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

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
