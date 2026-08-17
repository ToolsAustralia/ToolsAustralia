import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import Order from "@/models/Order";
import { z } from "zod";
import { requireAuthenticatedUserDoc } from "@/lib/api-auth";
import { requireSameOrigin } from "@/utils/security/requireSameOrigin";

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

export async function GET() {
  try {
    await connectDB();
    const auth = await requireAuthenticatedUserDoc();
    if ("errorResponse" in auth) return auth.errorResponse;
    const { user } = auth;

    const orders = await Order.find({ user: user._id }).populate("products.product").sort({ createdAt: -1 }).lean();

    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const csrf = requireSameOrigin(request);
    if (csrf) return csrf;
    await connectDB();
    const auth = await requireAuthenticatedUserDoc();
    if ("errorResponse" in auth) return auth.errorResponse;
    const { user } = auth;

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
