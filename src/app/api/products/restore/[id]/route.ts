import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { z } from "zod";

const paramsSchema = z.object({
  id: z.string().min(1),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    const { id } = paramsSchema.parse(await params);

    const product = await Product.findById(id);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Restore product
    product.isActive = true;
    await product.save();

    return NextResponse.json({
      message: "Product restored successfully",
      productId: id,
      productName: product.name,
      isActive: product.isActive,
    });
  } catch (error) {
    console.error("Error restoring product:", error);
    return NextResponse.json({ error: "Failed to restore product" }, { status: 500 });
  }
}

