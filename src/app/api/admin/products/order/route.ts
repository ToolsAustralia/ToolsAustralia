import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";

/**
 * Persist the admin's manual catalogue order.
 *
 * Mirrors `POST /api/admin/mini-draw/order` — same payload shape, same 1..N
 * assignment, same `displayOrder` field name. The two admin panels do the same
 * job and a reader should not have to learn it twice.
 */
const orderSchema = z.object({
  orderedIds: z
    .array(z.string().regex(/^[0-9a-fA-F]{24}$/, "not a product id"))
    .min(1, "Provide at least one product id"),
});

export async function POST(request: NextRequest) {
  try {
    const guard = await requirePermissionWithAudit("shop.edit", request, {
      resourceType: "product-order",
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    const parsed = orderSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await connectDB();

    // 1..N, not 0..N-1: position 1 reads as "first" to a human reading the data,
    // and it leaves 0 free as an unmistakable "never positioned" sentinel.
    //
    // Every id in the list is rewritten, so a product that did not move still
    // gets a small number — that is what pulls the whole curated set above any
    // product still carrying the epoch-sized default.
    const operations = parsed.data.orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(id) },
        update: { $set: { displayOrder: index + 1 } },
      },
    }));

    const result = await Product.bulkWrite(operations);

    await log(200);
    return NextResponse.json({
      success: true,
      data: { matched: result.matchedCount, modified: result.modifiedCount },
      message: "Product order updated",
    });
  } catch (error) {
    console.error("Failed to update product order:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update product order" },
      { status: 500 }
    );
  }
}
