import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import MiniDraw from "@/models/MiniDraw";
import { requireAuthenticatedUserDoc } from "@/lib/api-auth";

export async function GET() {
  try {
    await connectDB();
    const auth = await requireAuthenticatedUserDoc();
    if ("errorResponse" in auth) return auth.errorResponse;
    const { user } = auth;

    // Calculate totals from cart items
    let subtotal = 0;
    let totalItems = 0;

    for (const item of user.cart) {
      if (item.type === "product" && item.productId) {
        const product = await Product.findById(item.productId).lean();
        if (product) {
          const productData = product as { price?: number };
          subtotal += (productData.price || 0) * item.quantity;
          totalItems += item.quantity;
        }
      } else if (item.type === "ticket" && item.miniDrawId) {
        const miniDraw = await MiniDraw.findById(item.miniDrawId).lean();
        if (miniDraw) {
          const miniDrawData = miniDraw as { ticketPrice?: number };
          subtotal += (miniDrawData.ticketPrice || 0) * item.quantity;
          totalItems += item.quantity;
        }
      }
    }

    // Calculate tax (assuming 10% GST for Australia)
    const tax = subtotal * 0.1;

    // Calculate shipping (free shipping over $100, otherwise $10)
    const shipping = subtotal >= 100 ? 0 : 10;

    // Calculate total amount
    const totalAmount = subtotal + tax + shipping;

    const summary = {
      totalItems,
      totalAmount,
      subtotal,
      tax,
      shipping,
      discount: 0,
      membershipDiscount: 0,
      partnerDiscount: 0,
    };

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error fetching cart summary:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch cart summary",
      },
      { status: 500 }
    );
  }
}
