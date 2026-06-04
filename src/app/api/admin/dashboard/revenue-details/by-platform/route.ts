import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { resolveRevenueDetailsRange, type RevenueDetailsDateRange } from "@/services/admin/dashboardSlices";
import {
  getPlatformRevenueBreakdown,
  ACQUISITION_CATEGORIES,
  type AcquisitionCategory,
} from "@/services/admin/platformRevenueBreakdown";
import { ATTRIBUTED_PLATFORM_KEYS, type AttributedPlatformKey } from "@/models/DashboardStatsDailySnapshot";

/**
 * GET /api/admin/dashboard/revenue-details/by-platform
 * Acquisition revenue for one convertingPlatform, split by source category, with a
 * paginated buyer list (optionally filtered to one category). `summaryOnly=true`
 * returns just the category bars (hover path).
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("overview.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const sp = request.nextUrl.searchParams;
    const platform = sp.get("platform") as AttributedPlatformKey | null;
    const categoryParam = sp.get("category");
    const dateRange = (sp.get("dateRange") as RevenueDetailsDateRange) || "today";
    const startDateParam = sp.get("startDate");
    const endDateParam = sp.get("endDate");
    const pageRaw = parseInt(sp.get("page") || "1", 10);
    const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1;
    const limitRaw = parseInt(sp.get("limit") || "50", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 50;
    const summaryOnly = sp.get("summaryOnly") === "true";

    if (!platform || !ATTRIBUTED_PLATFORM_KEYS.includes(platform)) {
      return NextResponse.json({ error: "valid platform parameter is required" }, { status: 400 });
    }

    let category: AcquisitionCategory | undefined;
    if (categoryParam) {
      if (!ACQUISITION_CATEGORIES.includes(categoryParam as AcquisitionCategory)) {
        return NextResponse.json({ error: "invalid category parameter" }, { status: 400 });
      }
      category = categoryParam as AcquisitionCategory;
    }

    const rangeResult = resolveRevenueDetailsRange({ dateRange, startDateParam, endDateParam });
    if (!rangeResult.ok) {
      return NextResponse.json({ error: rangeResult.error }, { status: rangeResult.status });
    }

    const data = await getPlatformRevenueBreakdown({
      platform,
      startDate: rangeResult.value.startDate,
      endDate: rangeResult.value.endDate,
      category,
      page,
      limit,
      summaryOnly,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching platform revenue breakdown:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch platform revenue breakdown",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
