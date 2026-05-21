import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import {
  getUpcomingRenewals,
  UPCOMING_RENEWALS_VALID_RANGES,
  type UpcomingRenewalsRange,
} from "@/services/admin/dashboardSlices";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * GET /api/admin/dashboard/upcoming-renewals?range=0|3|7|27&page=1&limit=50
 * Paged list of subscriptions due to renew in the selected window.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("overview.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const rangeParam = request.nextUrl.searchParams.get("range");
    const range = (rangeParam ? parseInt(rangeParam, 10) : 7) as UpcomingRenewalsRange;
    if (!UPCOMING_RENEWALS_VALID_RANGES.includes(range)) {
      return NextResponse.json(
        { error: "Invalid range", validValues: UPCOMING_RENEWALS_VALID_RANGES },
        { status: 400 }
      );
    }

    const pageParam = request.nextUrl.searchParams.get("page");
    const page = Math.max(1, parseInt(pageParam || "1", 10));
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(limitParam || String(DEFAULT_LIMIT), 10)));

    const data = await getUpcomingRenewals({ range, page, limit });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching upcoming renewals:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch upcoming renewals",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
