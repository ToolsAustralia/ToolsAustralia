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

    const bestSellers = await Product.find({
      isActive: true,
    }).select(PUBLIC_PRODUCT_EXCLUDE)
      .sort({ rating: -1, reviewCount: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json(bestSellers, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300", // Cache 1min, serve stale up to 5min
      },
    });
  } catch (error) {
    console.error("Error fetching best sellers:", error);
    return NextResponse.json(
      { error: "Failed to fetch best sellers" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
}
