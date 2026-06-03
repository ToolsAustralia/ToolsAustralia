/**
 * Admin Error Reports API
 *
 * Handles fetching error reports (admin only). Thin handler — delegates the
 * filtering, aggregation, and pagination work to
 * {@link listErrorReports} in `src/services/error-reporting/ErrorReportQueryService.ts`.
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { requirePermission } from "@/lib/api-auth-permissions";
import { listErrorReports } from "@/services/error-reporting/ErrorReportQueryService";

/**
 * GET /api/admin/error-reports
 * Get error reports with filtering, pagination, and statistics.
 *
 * Query Parameters:
 * - page, limit, status, userId, startDate, endDate, search, sortBy, sortOrder,
 *   category, severity, userEmail, autoLogged, apiEndpoint, pageUrl,
 *   includeArchived
 */
export async function GET(request: NextRequest) {
  try {
    const _guard = await requirePermission("errorReports.view");
    if (_guard instanceof NextResponse) return _guard;

    await connectDB();

    const { searchParams } = new URL(request.url);
    const result = await listErrorReports({
      page: parseInt(searchParams.get("page") || "1", 10),
      limit: parseInt(searchParams.get("limit") || "20", 10),
      status: searchParams.get("status"),
      userId: searchParams.get("userId"),
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
      search: searchParams.get("search"),
      sortBy: searchParams.get("sortBy"),
      sortOrder: searchParams.get("sortOrder"),
      category: searchParams.get("category"),
      severity: searchParams.get("severity"),
      userEmail: searchParams.get("userEmail"),
      autoLogged: searchParams.get("autoLogged"),
      apiEndpoint: searchParams.get("apiEndpoint"),
      pageUrl: searchParams.get("pageUrl"),
      includeArchived: searchParams.get("includeArchived") === "true",
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching error reports:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch error reports",
        message: error instanceof Error ? error.message : "An unknown error occurred",
      },
      { status: 500 }
    );
  }
}
