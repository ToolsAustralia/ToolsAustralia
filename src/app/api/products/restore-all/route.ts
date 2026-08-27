import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { requirePermissionWithAudit } from "@/lib/audit-log";

export async function PATCH(request: NextRequest) {
  const guard = await requirePermissionWithAudit("shop.edit", request, { resourceType: "product" });
  if (guard instanceof NextResponse) return guard;

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
