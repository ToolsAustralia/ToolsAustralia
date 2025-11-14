import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";

export async function PATCH() {
  try {
    await connectDB();

    const result = await Product.updateMany({ isActive: true }, { $set: { isActive: false } });

    return NextResponse.json({
      message: "All products archived successfully",
      archivedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error archiving all products:", error);
    return NextResponse.json({ error: "Failed to archive all products" }, { status: 500 });
  }
}
