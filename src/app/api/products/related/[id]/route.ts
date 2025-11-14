import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { z } from "zod";

const paramsSchema = z.object({
  id: z.string().min(1),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    const { id } = paramsSchema.parse(await params);
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "4");

    // First, get the current product to find related products
    const currentProduct = await Product.findById(id).lean();
    if (!currentProduct) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Find related products based on category and brand
    const relatedProducts = await Product.find({
      _id: { $ne: id },
      isActive: true,
      $or: [
        { category: (currentProduct as Record<string, unknown>).category },
        { brand: (currentProduct as Record<string, unknown>).brand },
      ],
    })
      .sort({ rating: -1, reviewCount: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json(relatedProducts);
  } catch (error) {
    console.error("Error fetching related products:", error);
    return NextResponse.json({ error: "Failed to fetch related products" }, { status: 500 });
  }
}
