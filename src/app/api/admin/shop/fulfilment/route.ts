import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requirePermission } from "@/lib/api-auth-permissions";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import {
  buildFulfilmentExport,
  markSubmitted,
  toCsv,
} from "@/services/shop/fulfilmentExport";

/**
 * Manual fulfilment hand-off to the print provider.
 *
 * GET  — the pending queue, or `?format=csv` for the file to upload to their bulk
 *        screen. Read-only: it never marks anything.
 * POST — records that named orders were uploaded, which is what stops a garment
 *        being printed twice.
 *
 * The two are deliberately separate. Marking on download would hide a paid order
 * from the next export if the download failed or was cancelled — a garment that
 * silently never gets printed. Splitting them trades that for a possible double
 * upload, which is visible and recoverable.
 */

export async function GET(request: NextRequest) {
  const guard = await requirePermission("shop.view");
  if (guard instanceof NextResponse) return guard;

  try {
    await connectDB();
    const { rows, orderIds, missingProductId } = await buildFulfilmentExport();

    if (request.nextUrl.searchParams.get("format") === "csv") {
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      return new NextResponse(toCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="fulfilment-${stamp}.csv"`,
          // Contains customer names and addresses — never cacheable.
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json(
      {
        orderCount: orderIds.length,
        lineCount: rows.length,
        orderIds,
        missingProductId,
        rows,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[shop] fulfilment export failed:", error);
    return NextResponse.json({ error: "Failed to build the fulfilment export" }, { status: 500 });
  }
}

const markSchema = z.object({
  orderIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).min(1).max(500),
});

export async function POST(request: NextRequest) {
  // Audited: this is the record that a customer's order was handed to the printer,
  // and it is the thing that prevents a reprint. Who pressed it matters.
  const guard = await requirePermissionWithAudit("shop.edit", request, {
    resourceType: "order",
  });
  if (guard instanceof NextResponse) return guard;

  try {
    await connectDB();
    const { orderIds } = markSchema.parse(await request.json());
    const marked = await markSubmitted(orderIds);
    return NextResponse.json({ marked });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("[shop] failed to mark orders submitted:", error);
    return NextResponse.json({ error: "Failed to mark orders as submitted" }, { status: 500 });
  }
}
