import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { z } from "zod";

const paramsSchema = z.object({
  id: z.string().min(1),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    const { id } = paramsSchema.parse(await params);

    const originalProduct = await Product.findById(id);
    if (!originalProduct) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Create a duplicate with modified name and reset some fields
    const duplicateData = {
      ...originalProduct.toObject(),
      _id: undefined,
      name: `${originalProduct.name} (Copy)`,
      stock: 0,
      rating: 0,
      reviewCount: 0,
      reviews: [],
      isFeatured: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const duplicatedProduct = new Product(duplicateData);
    await duplicatedProduct.save();

    return NextResponse.json({
      message: "Product duplicated successfully",
      originalProduct: {
        id: originalProduct._id,
        name: originalProduct.name,
      },
      duplicatedProduct: {
        id: duplicatedProduct._id,
        name: duplicatedProduct.name,
      },
    });
  } catch (error) {
    console.error("Error duplicating product:", error);
    return NextResponse.json({ error: "Failed to duplicate product" }, { status: 500 });
  }
}
