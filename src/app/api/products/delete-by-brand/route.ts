import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { z } from "zod";

const deleteByBrandSchema = z.object({
  brand: z.string().min(1),
});

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const validatedData = deleteByBrandSchema.parse(body);

    const result = await Product.deleteMany({
      brand: validatedData.brand,
    });

    return NextResponse.json({
      message: `All products from brand "${validatedData.brand}" deleted successfully`,
      deletedCount: result.deletedCount,
      brand: validatedData.brand,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error deleting products by brand:", error);
    return NextResponse.json({ error: "Failed to delete products by brand" }, { status: 500 });
  }
}
