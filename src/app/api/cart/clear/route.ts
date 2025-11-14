import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { verify } from "jsonwebtoken";
import { JWTPayload } from "@/types/api";

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

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();
    const user = await getUserFromToken(request);

    user.cart = [];
    await user.save();

    return NextResponse.json({
      message: "Cart cleared successfully",
      cart: user.cart,
    });
  } catch (error) {
    console.error("Error clearing cart:", error);
    return NextResponse.json({ error: "Failed to clear cart" }, { status: 500 });
  }
}
