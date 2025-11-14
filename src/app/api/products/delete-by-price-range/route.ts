import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { z } from "zod";

const deleteByPriceRangeSchema = z.object({
  minPrice: z.number().min(0),
  maxPrice: z.number().min(0),
});

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const validatedData = deleteByPriceRangeSchema.parse(body);

    const result = await Product.deleteMany({
      price: {
        $gte: validatedData.minPrice,
        $lte: validatedData.maxPrice,
      },
    });

    return NextResponse.json({
      message: `All products with price between $${validatedData.minPrice} and $${validatedData.maxPrice} deleted successfully`,
      deletedCount: result.deletedCount,
      priceRange: {
        min: validatedData.minPrice,
        max: validatedData.maxPrice,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error deleting products by price range:", error);
    return NextResponse.json({ error: "Failed to delete products by price range" }, { status: 500 });
  }
}

