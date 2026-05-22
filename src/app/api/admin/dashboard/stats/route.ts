import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { DashboardStatsService, DashboardStatsInputError } from "@/services/admin/DashboardStatsService";

export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("overview.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();
    const sp = request.nextUrl.searchParams;
    const stats = await new DashboardStatsService().getStats({
      dateRange: (sp.get("dateRange") as "today" | "yesterday" | "all-time" | "custom" | "current-draw" | "last-draw") || "today",
      startDate: sp.get("startDate") ?? undefined,
      endDate: sp.get("endDate") ?? undefined,
    });
    return NextResponse.json({ success: true, data: stats });
  } catch (e) {
    console.error("❌ /api/admin/dashboard/stats error", e);
    // The service throws DashboardStatsInputError for parse failures (400) — map back to status.
    if (e instanceof DashboardStatsInputError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Unknown";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
