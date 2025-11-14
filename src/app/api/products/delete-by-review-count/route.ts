import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { z } from "zod";

const deleteByReviewCountSchema = z.object({
  minReviewCount: z.number().int().min(0),
  maxReviewCount: z.number().int().min(0),
});

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const validatedData = deleteByReviewCountSchema.parse(body);

    const result = await Product.deleteMany({
      reviewCount: {
        $gte: validatedData.minReviewCount,
        $lte: validatedData.maxReviewCount,
      },
    });

    return NextResponse.json({
      message: `All products with review count between ${validatedData.minReviewCount} and ${validatedData.maxReviewCount} deleted successfully`,
      deletedCount: result.deletedCount,
      reviewCountRange: {
        min: validatedData.minReviewCount,
        max: validatedData.maxReviewCount,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error deleting products by review count:", error);
    return NextResponse.json({ error: "Failed to delete products by review count" }, { status: 500 });
  }
}
