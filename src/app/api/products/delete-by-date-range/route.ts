import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { z } from "zod";

const deleteByDateRangeSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const validatedData = deleteByDateRangeSchema.parse(body);

    const result = await Product.deleteMany({
      createdAt: {
        $gte: new Date(validatedData.startDate),
        $lte: new Date(validatedData.endDate),
      },
    });

    return NextResponse.json({
      message: `All products created between ${validatedData.startDate} and ${validatedData.endDate} deleted successfully`,
      deletedCount: result.deletedCount,
      dateRange: {
        start: validatedData.startDate,
        end: validatedData.endDate,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error deleting products by date range:", error);
    return NextResponse.json({ error: "Failed to delete products by date range" }, { status: 500 });
  }
}
