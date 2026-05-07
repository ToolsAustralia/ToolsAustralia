import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import Order from "@/models/Order";
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

    const orders = await Order.find({ user: user._id })
      .populate("products.productId")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

// POST /api/orders was removed in the shop refactor: orders are now written
// exclusively by the Stripe webhook handler (`finalizeShopOrder`) on
// `payment_intent.succeeded`. Client-side order writes are no longer permitted.
