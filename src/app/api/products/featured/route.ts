import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { PUBLIC_PRODUCT_EXCLUDE } from "@/utils/shop/public-product-fields";

// Next.js ISR configuration
export const revalidate = 60; // Revalidate every 60 seconds (ISR)

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "8");

    const featuredProducts = await Product.find({
      isActive: true,
      isFeatured: true,
    }).select(PUBLIC_PRODUCT_EXCLUDE)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json(featuredProducts, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300", // Cache 1min, serve stale up to 5min
      },
    });
  } catch (error) {
    console.error("Error fetching featured products:", error);
    return NextResponse.json(
      { error: "Failed to fetch featured products" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
}
