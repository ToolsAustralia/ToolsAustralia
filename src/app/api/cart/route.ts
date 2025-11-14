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

const addToCartSchema = z
  .object({
    type: z.enum(["product", "ticket"]),
    productId: z.string().min(1).optional(),
    miniDrawId: z.string().min(1).optional(),
    quantity: z.number().int().min(1),
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

const removeFromCartSchema = z
  .object({
    type: z.enum(["product", "ticket"]),
    productId: z.string().min(1).optional(),
    miniDrawId: z.string().min(1).optional(),
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

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const user = await getUserFromToken(request);

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

    // Calculate totals
    const subtotal = cartItems.reduce((total, item) => {
      if (item.type === "product" && item.product) {
        return total + (item.product.price || 0) * item.quantity;
      } else if (item.type === "ticket" && item.miniDraw) {
        return total + (item.miniDraw.ticketPrice || 0) * item.quantity;
      }
      return total;
    }, 0);

    const itemCount = cartItems.reduce((count, item) => count + item.quantity, 0);

    return NextResponse.json({
      cart: cartItems,
      subtotal,
      itemCount,
      summary: {
        productItems: cartItems.filter((item) => item.type === "product").length,
        ticketItems: cartItems.filter((item) => item.type === "ticket").length,
      },
    });
  } catch (error) {
    console.error("Error fetching cart:", error);
    return NextResponse.json({ error: "Failed to fetch cart" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const user = await getUserFromToken(request);

    const body = await request.json();
    const validatedData = addToCartSchema.parse(body);

    if (validatedData.type === "product") {
      // Handle product addition
      const product = await Product.findById(validatedData.productId);
      if (!product) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }

      if (product.stock < validatedData.quantity) {
        return NextResponse.json({ error: "Insufficient stock" }, { status: 400 });
      }

      // Check if product is already in cart
      const existingItemIndex = findCartItem(user.cart, "product", validatedData.productId!);

      if (existingItemIndex > -1) {
        // Update quantity
        user.cart[existingItemIndex].quantity += validatedData.quantity;
      } else {
        // Add new item
        user.cart.push({
          type: "product",
          productId: new Types.ObjectId(validatedData.productId),
          quantity: validatedData.quantity,
          price: product.price,
        });
      }
    } else if (validatedData.type === "ticket") {
      // Handle ticket entry addition
      const miniDraw = await MiniDraw.findById(validatedData.miniDrawId);
      if (!miniDraw) {
        return NextResponse.json({ error: "Mini draw not found" }, { status: 404 });
      }

      if (!miniDraw.isActive) {
        return NextResponse.json({ error: "Mini draw is not active" }, { status: 400 });
      }

      const now = new Date();
      if (now < miniDraw.startDate || now > miniDraw.endDate) {
        return NextResponse.json({ error: "Mini draw is not currently accepting entries" }, { status: 400 });
      }

      const ticketsRemaining = miniDraw.totalTickets - miniDraw.soldTickets;
      if (ticketsRemaining < validatedData.quantity) {
        return NextResponse.json(
          {
            error: `Only ${ticketsRemaining} tickets remaining`,
          },
          { status: 400 }
        );
      }

      // Check if mini draw is already in cart
      const existingItemIndex = findCartItem(user.cart, "ticket", validatedData.miniDrawId!);

      if (existingItemIndex > -1) {
        // Update quantity
        user.cart[existingItemIndex].quantity += validatedData.quantity;
      } else {
        // Add new item
        user.cart.push({
          type: "ticket",
          miniDrawId: new Types.ObjectId(validatedData.miniDrawId),
          quantity: validatedData.quantity,
          price: miniDraw.ticketPrice,
        });
      }
    }

    await user.save();

    return NextResponse.json({
      message: `${validatedData.type === "product" ? "Product" : "Ticket entries"} added to cart successfully`,
      cart: user.cart,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error adding to cart:", error);
    return NextResponse.json(
      {
        error: "Failed to add item to cart",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    await connectDB();
    const user = await getUserFromToken(request);

    const body = await request.json();
    const validatedData = updateCartSchema.parse(body);

    const itemIndex = findCartItem(
      user.cart,
      validatedData.type,
      validatedData.type === "product" ? validatedData.productId! : validatedData.miniDrawId!
    );

    if (itemIndex === -1) {
      return NextResponse.json(
        {
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

    return NextResponse.json({
      message: "Cart updated successfully",
      cart: user.cart,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error updating cart:", error);
    return NextResponse.json({ error: "Failed to update cart" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();
    const user = await getUserFromToken(request);

    const body = await request.json();
    const validatedData = removeFromCartSchema.parse(body);

    const id = validatedData.type === "product" ? validatedData.productId! : validatedData.miniDrawId!;

    user.cart = user.cart.filter((item: CartItem) => {
      if (validatedData.type === "product") {
        return !(item.type === "product" && item.productId?.toString() === id);
      } else {
        return !(item.type === "ticket" && item.miniDrawId?.toString() === id);
      }
    });

    await user.save();

    return NextResponse.json({
      message: `${validatedData.type === "product" ? "Product" : "Mini draw"} removed from cart successfully`,
      cart: user.cart,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error removing from cart:", error);
    return NextResponse.json({ error: "Failed to remove item from cart" }, { status: 500 });
  }
}
