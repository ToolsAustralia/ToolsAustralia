import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import Order from "@/models/Order";
import { z } from "zod";
import { requireAuthenticatedUserDoc } from "@/lib/api-auth";
import { requireSameOrigin } from "@/utils/security/requireSameOrigin";
import { listOrders } from "@/services/shop/orderQueries";

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

/**
 * The signed-in customer's own order history.
 *
 * Shares listOrders with the admin list; the ONLY difference is that userId is
 * pinned to the session here, which is the entire security boundary. It is read
 * from the session and never from a query parameter.
 *
 * Previously this did an unprojected .find().populate("products.product"), which
 * shipped every full Product document plus every address on every order — the
 * exact unprojected-list footgun CLAUDE.md documents. The shared service projects
 * an explicit include-list instead.
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const auth = await requireAuthenticatedUserDoc();
    if ("errorResponse" in auth) return auth.errorResponse;
    const { user } = auth;

    const params = request.nextUrl.searchParams;
    const result = await listOrders({
      userId: String(user._id),
      page: Number(params.get("page")) || 1,
      limit: Math.min(50, Number(params.get("limit")) || 20),
    });

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
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
