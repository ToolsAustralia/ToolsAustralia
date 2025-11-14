import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";

export async function PATCH() {
  try {
    await connectDB();

    const result = await Product.updateMany({ isActive: false }, { $set: { isActive: true } });

    return NextResponse.json({
      message: "All archived products restored successfully",
      restoredCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error restoring all products:", error);
    return NextResponse.json({ error: "Failed to restore all products" }, { status: 500 });
  }
}
