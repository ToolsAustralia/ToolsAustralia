import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import MiniDraw from "@/models/MiniDraw";
import { z } from "zod";
import { Types } from "mongoose";
import { requireAuthenticatedUserDoc } from "@/lib/api-auth";
import { requireSameOrigin } from "@/utils/security/requireSameOrigin";
import { priceCart, dollarsToCents, toDollarSummary } from "@/utils/shop/pricing";

// Define the cart item type from the User model
type CartItem = {
  type: "product" | "ticket";
  productId?: Types.ObjectId;
  /** Chosen variant. Two lines can share a productId and differ only by this. */
  sku?: string;
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
    sku: z.string().trim().min(1).max(64).optional(),
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

/**
 * Find one cart line.
 *
 * A product line's identity is `(productId, sku)`, not productId alone — the
 * same tee in Black L and Navy XL are two lines sharing a productId. Matching
 * on productId only meant the quantity buttons edited whichever variant
 * happened to sit first in the array, so a customer nudging Navy XL up to 2
 * silently changed their Black L instead.
 *
 * A request WITHOUT a sku matches only a line without one, i.e. a product with
 * no variants. That mirrors DELETE /api/cart, which already got this right.
 */
function findCartItem(
  cart: CartItem[],
  type: "product" | "ticket",
  id: string,
  sku?: string
): number {
  return cart.findIndex((item: CartItem) => {
    if (type === "product") {
      return item.type === "product" && item.productId?.toString() === id && item.sku === sku;
    }
    return item.type === "ticket" && item.miniDrawId?.toString() === id;
  });
}

export async function PUT(request: NextRequest) {
  try {
    const csrf = requireSameOrigin(request);
    if (csrf) return csrf;
    await connectDB();
    const auth = await requireAuthenticatedUserDoc();
    if ("errorResponse" in auth) return auth.errorResponse;
    const { user } = auth;

    const body = await request.json();
    const validatedData = updateCartSchema.parse(body);

    const id = validatedData.type === "product" ? validatedData.productId! : validatedData.miniDrawId!;
    const itemIndex = findCartItem(user.cart, validatedData.type, id, validatedData.sku);

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

    // Prices are GST-INCLUSIVE. This route carried its own copy of the money
    // math and added 10% on top of an already-inclusive price, so a cart quoted
    // here disagreed with the same cart quoted by /api/cart/summary.
    const totals = priceCart(
      transformedItems.map((item) => ({
        priceCents: dollarsToCents(item.price),
        quantity: item.quantity,
      }))
    );

    const response = {
      items: transformedItems,
      summary: {
        ...toDollarSummary(totals),
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






