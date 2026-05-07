import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import Product from "@/models/Product";
import MiniDraw from "@/models/MiniDraw";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

async function getRequestUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return User.findById(session.user.id);
}

export async function GET() {
  try {
    await connectDB();
    const user = await getRequestUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    // AU GST-inclusive pricing: prices already include GST. gstIncluded is the
    // 1/11 portion of totalAmount — for display only.
    const shipping = subtotal === 0 ? 0 : subtotal >= 100 ? 0 : 10;
    const totalAmount = subtotal + shipping;
    const gstIncluded = totalAmount === 0 ? 0 : Math.round((totalAmount / 11) * 100) / 100;

    const summary = {
      totalItems,
      totalAmount,
      subtotal,
      gstIncluded,
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
