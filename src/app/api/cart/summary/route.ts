import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import Product from "@/models/Product";
import MiniDraw from "@/models/MiniDraw";
import { JwtPayload } from "jsonwebtoken";
// Remove unused import

// Helper function to get user from token
async function getUserFromToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("No token provided");
  }

  const token = authHeader.substring(7);

  try {
    // Try to decode as JWT first using dynamic import
    const jwtModule = await import("jsonwebtoken");
    const jwt = jwtModule.default || jwtModule;
    const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as JwtPayload;
    const userId = decoded.userId || decoded.sub;
    const user = await User.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  } catch {
    // If JWT decoding fails, try treating it as a direct user ID
    try {
      const user = await User.findById(token);
      if (!user) {
        throw new Error("User not found");
      }
      return user;
    } catch {
      throw new Error("Invalid token or user not found");
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const user = await getUserFromToken(request);

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
