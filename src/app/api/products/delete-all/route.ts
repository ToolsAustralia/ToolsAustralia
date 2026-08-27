import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { requirePermissionWithAudit } from "@/lib/audit-log";

export async function DELETE(request: NextRequest) {
  const guard = await requirePermissionWithAudit("shop.delete", request, { resourceType: "product" });
  if (guard instanceof NextResponse) return guard;

  try {
    await connectDB();

    const result = await Product.deleteMany({});

    return NextResponse.json({
      message: "All products deleted successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error deleting all products:", error);
    return NextResponse.json({ error: "Failed to delete all products" }, { status: 500 });
  }
}
