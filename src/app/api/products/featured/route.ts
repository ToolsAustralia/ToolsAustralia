import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "8");

    const featuredProducts = await Product.find({
      isActive: true,
      isFeatured: true,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json(featuredProducts);
  } catch (error) {
    console.error("Error fetching featured products:", error);
    return NextResponse.json({ error: "Failed to fetch featured products" }, { status: 500 });
  }
}

