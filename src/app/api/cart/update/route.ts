import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import Product from "@/models/Product";
import MiniDraw from "@/models/MiniDraw";
import { z } from "zod";
import { JwtPayload } from "jsonwebtoken";
import { Types } from "mongoose";

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

const updateCartSchema = z
  .object({
    type: z.enum(["product", "ticket"]),
    productId: z.string().min(1).optional(),
    miniDrawId: z.string().min(1).optional(),
    quantity: z.number().int().min(0),
  })
  .refine(
    (data) => {
      if (data.type === "product" && !data.productId) return false;
      if (data.type === "ticket" && !data.miniDrawId) return false;
      return true;
    },
    {
      message: "productId is required for product type, miniDrawId is required for ticket type",
    }
  );

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

// Helper function to find cart item
function findCartItem(cart: CartItem[], type: "product" | "ticket", id: string): number {
  return cart.findIndex((item: CartItem) => {
    if (type === "product") {
      return item.type === "product" && item.productId?.toString() === id;
    } else {
      return item.type === "ticket" && item.miniDrawId?.toString() === id;
    }
  });
}

export async function PUT(request: NextRequest) {
  try {
    await connectDB();
    const user = await getUserFromToken(request);

    const body = await request.json();
    const validatedData = updateCartSchema.parse(body);

    const id = validatedData.type === "product" ? validatedData.productId! : validatedData.miniDrawId!;
    const itemIndex = findCartItem(user.cart, validatedData.type, id);

    if (itemIndex === -1) {
      return NextResponse.json(
        {
          success: false,
          error: `${validatedData.type === "product" ? "Product" : "Mini draw"} not found in cart`,
        },
        { status: 404 }
      );
    }

    if (validatedData.quantity === 0) {
      // Remove item
      user.cart.splice(itemIndex, 1);
    } else {
      // Update quantity
      user.cart[itemIndex].quantity = validatedData.quantity;
    }

    await user.save();

    // Get updated cart items with details
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

    // Calculate summary
    const subtotal = transformedItems.reduce((total, item) => total + item.price * item.quantity, 0);
    const tax = subtotal * 0.1;
    const shipping = subtotal >= 100 ? 0 : 10;
    const totalAmount = subtotal + tax + shipping;
    const totalItems = transformedItems.reduce((count, item) => count + item.quantity, 0);

    const response = {
      items: transformedItems,
      summary: {
        totalItems,
        totalAmount,
        subtotal,
        tax,
        shipping,
        discount: 0,
        membershipDiscount: 0,
        partnerDiscount: 0,
      },
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.issues,
        },
        { status: 400 }
      );
    }
    console.error("Error updating cart:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update cart",
      },
      { status: 500 }
    );
  }
}






