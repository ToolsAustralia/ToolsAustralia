import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import MiniDraw from "@/models/MiniDraw";
import { requireAuthenticatedUserDoc } from "@/lib/api-auth";
import { priceCart, dollarsToCents, toDollarSummary } from "@/utils/shop/pricing";

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

    // Prices are GST-INCLUSIVE. This endpoint used to add 10% on top of an
    // already-inclusive price, overcharging every cart by exactly that much, and
    // carried its own copy of the shipping rule. Both now come from one module.
    //
    // One synthetic line carrying the already-resolved server-side subtotal:
    // priceCart only needs the money, and this preserves the total exactly.
    // An empty cart must pass NO lines — a synthetic `quantity: 1` line would
    // miss priceCart's empty-cart guard and charge flat shipping on nothing.
    const totals = priceCart(
      totalItems === 0 ? [] : [{ priceCents: dollarsToCents(subtotal), quantity: 1 }]
    );

    const summary = {
      ...toDollarSummary(totals),
      // The synthetic single line above collapses quantities, so report the real count.
      totalItems,
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
