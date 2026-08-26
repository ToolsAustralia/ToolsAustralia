import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { requirePermissionWithAudit } from "@/lib/audit-log";

export async function DELETE(request: NextRequest) {
  const guard = await requirePermissionWithAudit("shop.delete", request, { resourceType: "product" });
  if (guard instanceof NextResponse) return guard;

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
