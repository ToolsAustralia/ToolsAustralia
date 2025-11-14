import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { z } from "zod";

const deleteByRatingSchema = z.object({
  minRating: z.number().min(0).max(5),
  maxRating: z.number().min(0).max(5),
});

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const validatedData = deleteByRatingSchema.parse(body);

    const result = await Product.deleteMany({
      rating: {
        $gte: validatedData.minRating,
        $lte: validatedData.maxRating,
      },
    });

    return NextResponse.json({
      message: `All products with rating between ${validatedData.minRating} and ${validatedData.maxRating} deleted successfully`,
      deletedCount: result.deletedCount,
      ratingRange: {
        min: validatedData.minRating,
        max: validatedData.maxRating,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error deleting products by rating:", error);
    return NextResponse.json({ error: "Failed to delete products by rating" }, { status: 500 });
  }
}
