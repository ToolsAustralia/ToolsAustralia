import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { getActivityLog } from "@/services/admin/ActivityLogService";

export type { ActivityLogItem } from "@/services/admin/ActivityLogService";

/**
 * GET /api/admin/activity-log
 * Get paginated activity log with filters
 *
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 25)
 * - type: Filter by activity type (optional)
 * - search: Search term (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("overview.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "25", 10);
    const typeFilter = searchParams.get("type");
    const searchTerm = searchParams.get("search");

    const data = await getActivityLog({ page, limit, typeFilter, searchTerm });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching activity log:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch activity log",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
