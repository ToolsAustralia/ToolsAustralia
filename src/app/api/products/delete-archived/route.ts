import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";

export async function DELETE() {
  try {
    await connectDB();

    const result = await Product.deleteMany({ isActive: false });

    return NextResponse.json({
      message: "All archived products deleted successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error deleting archived products:", error);
    return NextResponse.json({ error: "Failed to delete archived products" }, { status: 500 });
  }
}
