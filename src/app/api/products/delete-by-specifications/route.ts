import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { z } from "zod";

const deleteBySpecificationsSchema = z.object({
  specifications: z.record(z.string(), z.string()),
});

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const validatedData = deleteBySpecificationsSchema.parse(body);

    const result = await Product.deleteMany({
      specifications: { $in: [validatedData.specifications] },
    });

    return NextResponse.json({
      message: `All products with specifications ${JSON.stringify(validatedData.specifications)} deleted successfully`,
      deletedCount: result.deletedCount,
      specifications: validatedData.specifications,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error deleting products by specifications:", error);
    return NextResponse.json({ error: "Failed to delete products by specifications" }, { status: 500 });
  }
}

