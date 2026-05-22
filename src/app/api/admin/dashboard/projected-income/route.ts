import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { getProjectedIncome } from "@/services/admin/dashboardSlices";

/**
 * GET /api/admin/dashboard/projected-income
 * Projected income from active subscriptions, upcoming-27th cohort, and past-due risk.
 */
export async function GET(_request: NextRequest) {
  try {
    const guard = await requirePermission("overview.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();
    const data = await getProjectedIncome();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching projected income:", error);
    return NextResponse.json(
      { error: "Failed to fetch projected income", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
