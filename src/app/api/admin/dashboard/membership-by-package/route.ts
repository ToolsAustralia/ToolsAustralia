import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { parseAdminDashboardDateRange } from "@/utils/admin/dashboardDateRange";
import { MembershipAnalyticsService } from "@/services/admin/MembershipAnalyticsService";
import { trendCalculationService } from "@/services/admin/TrendCalculationService";

/**
 * GET /api/admin/dashboard/membership-by-package
 * Live membership base by package for the KPI card.
 *
 * Query params match admin dashboard stats (dateRange, startDate, endDate).
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("overview.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const parsed = parseAdminDashboardDateRange({
      dateRange: searchParams.get("dateRange"),
      startDateParam: searchParams.get("startDate"),
      endDateParam: searchParams.get("endDate"),
    });

    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    const { startDate, endDate, dateRange, membershipAsOfMode, asOfDate } = parsed.value;
    const service = new MembershipAnalyticsService();

    const data =
      membershipAsOfMode === "snapshot" && asOfDate
        ? await service.getMembershipByPackageSnapshot(asOfDate)
        : await service.getMembershipByPackageLive();

    // MRR (active recurring revenue) trend vs the previous comparable period — the
    // same period-over-period comparison the Overview's other KPI tiles use (for
    // "today" that's all of yesterday). Skipped for all-time (no prior period) and
    // when the baseline day has no daily snapshot to read from.
    if (dateRange !== "all-time") {
      const { end: comparisonEnd } = trendCalculationService.getComparisonPeriod(startDate, endDate);
      const baseline = await service.getMembershipByPackageSnapshot(comparisonEnd);
      if (!baseline.summary.snapshotMissing) {
        data.summary.totalActiveRevenueTrend = trendCalculationService.calculateTrend(
          data.summary.totalActiveRevenue,
          baseline.summary.totalActiveRevenue
        );
      }
    }

    return NextResponse.json({
      success: true,
      data,
      meta: {
        membershipAsOfMode,
        asOf: asOfDate?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error("Error fetching membership by package:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch membership by package",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
