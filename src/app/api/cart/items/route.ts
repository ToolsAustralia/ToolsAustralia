import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import MiniDraw from "@/models/MiniDraw";
import { Types } from "mongoose";
import { requireAuthenticatedUserDoc } from "@/lib/api-auth";

// Define the cart item type from the User model
type CartItem = {
  type: "product" | "ticket";
  productId?: Types.ObjectId;
  miniDrawId?: Types.ObjectId;
  quantity: number;
  price?: number;
};

// Enhanced cart item with populated data
type CartItemWithDetails = {
  type: "product" | "ticket";
  productId?: string;
  miniDrawId?: string;
  quantity: number;
  price?: number;
  product?: {
    _id: string;
    name: string;
    price: number;
    images: string[];
    brand: string;
    stock: number;
  };
  miniDraw?: {
    _id: string;
    name: string;
    ticketPrice: number;
    totalTickets: number;
    soldTickets: number;
    prize: {
      name: string;
      value: number;
      images: string[];
    };
  };
};

export async function GET() {
  try {
    await connectDB();
    const auth = await requireAuthenticatedUserDoc();
    if ("errorResponse" in auth) return auth.errorResponse;
    const { user } = auth;

    // Get cart items with product/mini draw details
    const cartItems: CartItemWithDetails[] = await Promise.all(
      user.cart.map(async (item: CartItem) => {
        let product: CartItemWithDetails["product"] = undefined;
        let miniDraw: CartItemWithDetails["miniDraw"] = undefined;

        if (item.type === "product" && item.productId) {
          const foundProduct = await Product.findById(item.productId).lean();
          product = (foundProduct as unknown as CartItemWithDetails["product"]) || undefined;
        } else if (item.type === "ticket" && item.miniDrawId) {
          const foundMiniDraw = await MiniDraw.findById(item.miniDrawId).lean();
          miniDraw = (foundMiniDraw as unknown as CartItemWithDetails["miniDraw"]) || undefined;
        }

        return {
          type: item.type,
          productId: item.productId?.toString(),
          miniDrawId: item.miniDrawId?.toString(),
          quantity: item.quantity,
          price: item.price,
          product: product,
          miniDraw: miniDraw,
        };
      })
    );

    // Transform to match React Query expected format while preserving type information
    const transformedItems = cartItems.map((item) => ({
      type: item.type,
      productId: item.productId || item.miniDrawId || "",
      miniDrawId: item.miniDrawId,
      quantity: item.quantity,
      price: item.price || 0,
      product: item.product,
      miniDraw: item.miniDraw,
    }));

    return NextResponse.json({
      success: true,
      data: transformedItems,
    });
  } catch (error) {
    console.error("Error fetching cart items:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch cart items",
      },
      { status: 500 }
    );
  }
}
