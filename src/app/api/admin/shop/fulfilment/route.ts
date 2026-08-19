import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requirePermission } from "@/lib/api-auth-permissions";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import {
  buildFulfilmentExport,
  listRecentlySubmitted,
  markSubmitted,
  toCsv,
  unmarkSubmitted,
} from "@/services/shop/fulfilmentExport";

/**
 * Manual fulfilment hand-off to the print provider.
 *
 * GET    — the pending queue plus the orders recently marked, or `?format=csv` for
 *          the file to upload to their bulk screen. Read-only: it never marks.
 * POST   — records that named orders were uploaded, which is what stops a garment
 *          being printed twice.
 * DELETE — clears that record for named orders, putting them back in the queue.
 *
 * GET and POST are deliberately separate. Marking on download would hide a paid
 * order from the next export if the download failed or was cancelled — a garment
 * that silently never gets printed. Splitting them trades that for a possible double
 * upload, which is visible and recoverable.
 *
 * DELETE exists because the mark was otherwise a one-way door: a mis-click dropped
 * paid orders out of the queue for good, so they were never printed and nothing
 * surfaced it. It is its own method rather than a flag on POST so the audit row says
 * which of the two happened — the whole point of logging this route.
 *
 * Both mutations are audited. This is the record that a customer's order was handed
 * to the printer, and "who marked this sent" is a real support question. Neither
 * carries a `resourceId`: one press covers a whole batch of orders, and stamping the
 * row with only the first of them would read as a claim about that one order.
 */

export async function GET(request: NextRequest) {
  const guard = await requirePermission("shop.view");
  if (guard instanceof NextResponse) return guard;

  try {
    await connectDB();
    const { rows, orders, missingProductId, missingArtwork } =
      await buildFulfilmentExport(
      request.nextUrl.searchParams.getAll("orderId")
    );

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

    // Fetched alongside the queue rather than on demand: an order leaves the queue
    // the moment it is marked, so without this list a mis-click erases its own
    // evidence and there is nothing to point the undo at.
    const recentlySubmitted = await listRecentlySubmitted();

    // { success, data } matches /api/admin/products. The CSV branch above returns a
    // file and is deliberately not wrapped.
    return NextResponse.json(
      {
        success: true,
        data: {
          orderCount: orders.length,
          lineCount: rows.length,
          // Every array below must ship on every response: FulfilmentQueue reads
          // .length on all of them, and an omitted key crashed the whole admin
          // Products tab with "Cannot read properties of undefined" — caught by the
          // full-story e2e.
          orders,
          missingProductId,
          missingArtwork,
          rows,
          recentlySubmitted,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[shop] fulfilment export failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build the fulfilment export" },
      { status: 500 },
    );
  }
}

const orderIdsSchema = z.object({
  orderIds: z
    .array(z.string().regex(/^[0-9a-fA-F]{24}$/))
    .min(1)
    .max(500),
});

export async function POST(request: NextRequest) {
  const guard = await requirePermissionWithAudit("shop.edit", request, {
    resourceType: "order",
  });
  if (guard instanceof NextResponse) return guard;

  try {
    await connectDB();
    const { orderIds } = orderIdsSchema.parse(await request.json());
    const marked = await markSubmitted(orderIds);
    // Every outcome is logged, not just the successful one — matching the sibling
    // order route. A rejected mark is still someone reaching for this button.
    await guard.log(200);
    return NextResponse.json({ success: true, data: { marked } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      await guard.log(400);
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues },
        { status: 400 },
      );
    }
    console.error("[shop] failed to mark orders submitted:", error);
    await guard.log(500);
    return NextResponse.json(
      { success: false, error: "Failed to mark orders as submitted" },
      { status: 500 },
    );
  }
}

/**
 * `shop.edit`, the same permission as the mark: whoever can take an order out of the
 * queue has to be able to put it back, or a mis-click waits on someone else while the
 * customer waits on a garment nobody is printing.
 */
export async function DELETE(request: NextRequest) {
  const guard = await requirePermissionWithAudit("shop.edit", request, {
    resourceType: "order",
  });
  if (guard instanceof NextResponse) return guard;

  try {
    await connectDB();
    const { orderIds } = orderIdsSchema.parse(await request.json());
    const unmarked = await unmarkSubmitted(orderIds);
    await guard.log(200);
    return NextResponse.json({ success: true, data: { unmarked } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      await guard.log(400);
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues },
        { status: 400 },
      );
    }
    console.error("[shop] failed to return orders to the print queue:", error);
    await guard.log(500);
    return NextResponse.json(
      { success: false, error: "Failed to return the orders to the print queue" },
      { status: 500 },
    );
  }
}
