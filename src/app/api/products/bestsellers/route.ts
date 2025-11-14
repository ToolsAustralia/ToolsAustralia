import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "8");

    const bestSellers = await Product.find({
      isActive: true,
    })
      .sort({ rating: -1, reviewCount: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json(bestSellers);
  } catch (error) {
    console.error("Error fetching best sellers:", error);
    return NextResponse.json({ error: "Failed to fetch best sellers" }, { status: 500 });
  }
}

