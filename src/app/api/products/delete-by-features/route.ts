import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { z } from "zod";

const deleteByFeaturesSchema = z.object({
  features: z.array(z.string()).min(1),
});

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const validatedData = deleteByFeaturesSchema.parse(body);

    const result = await Product.deleteMany({
      features: { $in: validatedData.features },
    });

    return NextResponse.json({
      message: `All products with features ${validatedData.features.join(", ")} deleted successfully`,
      deletedCount: result.deletedCount,
      features: validatedData.features,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error deleting products by features:", error);
    return NextResponse.json({ error: "Failed to delete products by features" }, { status: 500 });
  }
}
