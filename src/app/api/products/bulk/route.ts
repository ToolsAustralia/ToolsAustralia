import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { z } from "zod";

const bulkUpdateSchema = z.object({
  productIds: z.array(z.string()).min(1),
  updates: z.object({
    isActive: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    category: z.string().optional(),
    brand: z.string().optional(),
    stock: z.number().int().min(0).optional(),
  }),
});

const bulkDeleteSchema = z.object({
  productIds: z.array(z.string()).min(1),
});

export async function PATCH(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const validatedData = bulkUpdateSchema.parse(body);

    const result = await Product.updateMany(
      { _id: { $in: validatedData.productIds } },
      { $set: validatedData.updates }
    );

    return NextResponse.json({
      message: "Products updated successfully",
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error bulk updating products:", error);
    return NextResponse.json({ error: "Failed to bulk update products" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const validatedData = bulkDeleteSchema.parse(body);

    const result = await Product.deleteMany({
      _id: { $in: validatedData.productIds },
    });

    return NextResponse.json({
      message: "Products deleted successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error bulk deleting products:", error);
    return NextResponse.json({ error: "Failed to bulk delete products" }, { status: 500 });
  }
}
