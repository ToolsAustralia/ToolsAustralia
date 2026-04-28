import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { parseAdminDashboardDateRange } from "@/utils/admin/dashboardDateRange";
import { MembershipAnalyticsService } from "@/services/admin/MembershipAnalyticsService";

/**
 * GET /api/admin/dashboard/membership-by-package
 * Live membership base by package for the KPI card.
 *
 * Query params match admin dashboard stats (dateRange, startDate, endDate).
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const parsed = parseAdminDashboardDateRange({
      dateRange: searchParams.get("dateRange"),
      startDateParam: searchParams.get("startDate"),
      endDateParam: searchParams.get("endDate"),
    });

    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    const { membershipAsOfMode, asOfDate } = parsed.value;
    const service = new MembershipAnalyticsService();

    // MembershipStatusHistory is a partial event log today, not a complete state ledger.
    // Use current User.subscription state for active MRR until historical snapshots are complete.
    const data = await service.getMembershipByPackageLive();

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
