import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import {
  getRevenueDetails,
  resolveRevenueDetailsRange,
  type RevenueDetailsCategory,
  type RevenueDetailsDateRange,
} from "@/services/admin/dashboardSlices";

const VALID_CATEGORIES: RevenueDetailsCategory[] = [
  "membership-purchase",
  "membership-renewal",
  "one-time-purchase",
  "additional-one-time",
  "mini-draw",
  "upsell",
];

/**
 * GET /api/admin/dashboard/revenue-details
 * Per-user contribution list for a single revenue category in a date range.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("overview.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get("category") as RevenueDetailsCategory | null;
    const dateRange = (searchParams.get("dateRange") as RevenueDetailsDateRange) || "today";
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "category parameter is required" }, { status: 400 });
    }

    const rangeResult = resolveRevenueDetailsRange({ dateRange, startDateParam, endDateParam });
    if (!rangeResult.ok) {
      return NextResponse.json({ error: rangeResult.error }, { status: rangeResult.status });
    }

    const data = await getRevenueDetails({
      category,
      startDate: rangeResult.value.startDate,
      endDate: rangeResult.value.endDate,
      page,
      limit,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching revenue details:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch revenue details",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
