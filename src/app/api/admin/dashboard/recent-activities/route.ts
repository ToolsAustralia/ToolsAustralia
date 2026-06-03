import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { getRecentActivities } from "@/services/admin/dashboardSlices";

export type { RecentActivity } from "@/services/admin/dashboardSlices";

/**
 * GET /api/admin/dashboard/recent-activities
 * Recent admin/site activity feed with pagination.
 * Query params: page (default 1), limit (default 20)
 */
export async function GET(request: Request) {
  try {
    const guard = await requirePermission("overview.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const { activities, pagination } = await getRecentActivities({ page, limit });

    return NextResponse.json({ success: true, data: activities, pagination });
  } catch (error) {
    console.error("Error fetching recent activities:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch recent activities",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
