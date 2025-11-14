import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { z } from "zod";

const deleteByCategorySchema = z.object({
  category: z.string().min(1),
});

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const validatedData = deleteByCategorySchema.parse(body);

    const result = await Product.deleteMany({
      category: validatedData.category,
    });

    return NextResponse.json({
      message: `All products in category "${validatedData.category}" deleted successfully`,
      deletedCount: result.deletedCount,
      category: validatedData.category,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error deleting products by category:", error);
    return NextResponse.json({ error: "Failed to delete products by category" }, { status: 500 });
  }
}
