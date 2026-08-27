import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { requirePermissionWithAudit } from "@/lib/audit-log";

export async function PATCH(request: NextRequest) {
  const guard = await requirePermissionWithAudit("shop.edit", request, { resourceType: "product" });
  if (guard instanceof NextResponse) return guard;

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
