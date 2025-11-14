import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import Product from "@/models/Product";
import Order from "@/models/Order";
import { z } from "zod";
import { verify } from "jsonwebtoken";
import { JWTPayload } from "@/types/api";

const createOrderSchema = z.object({
  products: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1),
      })
    )
    .min(1),
  shippingAddress: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    postalCode: z.string().min(1),
    country: z.string().min(1),
  }),
  paymentIntentId: z.string().min(1),
});

// Helper function to get user from token
async function getUserFromToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("No token provided");
  }

  const token = authHeader.substring(7);
  const decoded = verify(token, process.env.NEXTAUTH_SECRET!) as JWTPayload;
  const user = await User.findById(decoded.userId);

  if (!user) {
    throw new Error("User not found");
  }

  return user;
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const user = await getUserFromToken(request);

    const orders = await Order.find({ user: user._id }).populate("products.productId").sort({ createdAt: -1 }).lean();

    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const user = await getUserFromToken(request);

    const body = await request.json();
    const validatedData = createOrderSchema.parse(body);

    // Calculate total amount and validate products
    let totalAmount = 0;
    const orderProducts = [];

    for (const item of validatedData.products) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return NextResponse.json({ error: `Product ${item.productId} not found` }, { status: 404 });
      }

      if (product.stock < item.quantity) {
        return NextResponse.json({ error: `Insufficient stock for product ${product.name}` }, { status: 400 });
      }

      totalAmount += product.price * item.quantity;
      orderProducts.push({
        productId: item.productId,
        quantity: item.quantity,
        price: product.price,
      });

      // Update product stock
      product.stock -= item.quantity;
      await product.save();
    }

    // Create order
    const newOrder = new Order({
      user: user._id,
      products: orderProducts,
      totalAmount,
      status: "pending",
      shippingAddress: validatedData.shippingAddress,
      paymentIntentId: validatedData.paymentIntentId,
    });

    await newOrder.save();

    // Clear user's cart
    user.cart = [];
    await user.save();

    return NextResponse.json(
      {
        message: "Order created successfully",
        order: newOrder,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error creating order:", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
