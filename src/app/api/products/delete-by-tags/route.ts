import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { z } from "zod";

const deleteByTagsSchema = z.object({
  tags: z.array(z.string()).min(1),
});

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const validatedData = deleteByTagsSchema.parse(body);

    const result = await Product.deleteMany({
      tags: { $in: validatedData.tags },
    });

    return NextResponse.json({
      message: `All products with tags ${validatedData.tags.join(", ")} deleted successfully`,
      deletedCount: result.deletedCount,
      tags: validatedData.tags,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error deleting products by tags:", error);
    return NextResponse.json({ error: "Failed to delete products by tags" }, { status: 500 });
  }
}
