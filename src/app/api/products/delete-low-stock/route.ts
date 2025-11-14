import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const threshold = parseInt(searchParams.get("threshold") || "0");

    const result = await Product.deleteMany({
      stock: { $lte: threshold },
    });

    return NextResponse.json({
      message: `All products with stock <= ${threshold} deleted successfully`,
      deletedCount: result.deletedCount,
      threshold,
    });
  } catch (error) {
    console.error("Error deleting low stock products:", error);
    return NextResponse.json({ error: "Failed to delete low stock products" }, { status: 500 });
  }
}

