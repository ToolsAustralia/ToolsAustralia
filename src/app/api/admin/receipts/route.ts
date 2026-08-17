import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import {
  resolveRevenueDetailsRange,
  type RevenueDetailsDateRange,
} from "@/services/admin/dashboardSlices";
import {
  getReceipts,
  getReceiptsExport,
  RECEIPTS_DEFAULT_LIMIT,
  RECEIPTS_MAX_LIMIT,
} from "@/services/admin/receipts";
import { isReceiptCategory } from "@/utils/admin/receipts";

const VALID_DATE_RANGES: RevenueDetailsDateRange[] = [
  "today",
  "yesterday",
  "all-time",
  "custom",
  "current-draw",
  "last-draw",
];

/**
 * GET /api/admin/receipts
 *
 * The revenue ledger: one row per payment received in the window, newest first.
 *
 *   ?dateRange=today|yesterday|all-time|custom|current-draw|last-draw   (default: today)
 *   &startDate=&endDate=      required for custom / draw ranges
 *   &category=<ReceiptCategory>
 *   &page=&limit=
 *   &format=csv               downloads the whole filter — needs `receipts.export`
 *
 * The window is resolved by `resolveRevenueDetailsRange`, the same AEST helper the
 * dashboard's revenue slices use, so the two are comparable by construction.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("receipts.view");
    if (guard instanceof NextResponse) return guard;

    const { searchParams } = new URL(request.url);
    const wantsCsv = searchParams.get("format") === "csv";

    // The CSV is the same data as the table, but a file leaving the building is its own
    // risk (revenue joined to customer identity), so it carries its own grant.
    if (wantsCsv) {
      const exportGuard = await requirePermission("receipts.export");
      if (exportGuard instanceof NextResponse) return exportGuard;
    }

    await connectDB();

    const dateRangeParam = searchParams.get("dateRange") || "today";
    if (!VALID_DATE_RANGES.includes(dateRangeParam as RevenueDetailsDateRange)) {
      return NextResponse.json({ success: false, error: "Invalid dateRange" }, { status: 400 });
    }

    const range = resolveRevenueDetailsRange({
      dateRange: dateRangeParam as RevenueDetailsDateRange,
      startDateParam: searchParams.get("startDate"),
      endDateParam: searchParams.get("endDate"),
    });
    if (!range.ok) {
      return NextResponse.json({ success: false, error: range.error }, { status: range.status });
    }

    const categoryParam = searchParams.get("category");
    if (categoryParam && !isReceiptCategory(categoryParam)) {
      return NextResponse.json({ success: false, error: "Invalid category" }, { status: 400 });
    }
    const category = categoryParam && isReceiptCategory(categoryParam) ? categoryParam : undefined;

    const { startDate, endDate } = range.value;

    if (wantsCsv) {
      const result = await getReceiptsExport({ startDate, endDate, category });
      const filename = `receipts-${startDate.toISOString().slice(0, 10)}-to-${endDate
        .toISOString()
        .slice(0, 10)}.csv`;
      return new NextResponse(result.csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          // Read by the client so a capped export is announced rather than silently short.
          "X-Receipts-Row-Count": String(result.rowCount),
          "X-Receipts-Total-Count": String(result.totalCount),
          "X-Receipts-Truncated": String(result.truncated),
        },
      });
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(
      RECEIPTS_MAX_LIMIT,
      Math.max(
        1,
        parseInt(searchParams.get("limit") || String(RECEIPTS_DEFAULT_LIMIT), 10) ||
          RECEIPTS_DEFAULT_LIMIT
      )
    );

    const data = await getReceipts({ startDate, endDate, category, page, limit });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching admin receipts:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch receipts",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
