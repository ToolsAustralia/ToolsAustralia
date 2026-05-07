import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

async function getRequestUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return User.findById(session.user.id);
}

export async function DELETE() {
  try {
    await connectDB();
    const user = await getRequestUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
