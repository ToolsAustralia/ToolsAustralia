import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DailyMetricsService } from "@/services/metrics/DailyMetricsService";
import { handleApiError } from "@/lib/errors/handlers";

const dailyMetricsService = new DailyMetricsService();

/**
 * GET /api/admin/metrics/daily
 * Fetch daily metrics for a date range
 * Supports all breakdown levels: account, campaign, adset, ad
 * 
 * Query Parameters:
 * - startDate: ISO date string (required)
 * - endDate: ISO date string (required)
 * - level: "account" | "campaign" | "adset" | "ad" (optional, default: "account")
 * - breakdownId: string (optional, for filtering specific campaign/adset/ad)
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authentication & Authorization
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Admin access required" } },
        { status: 401 }
      );
    }

    // 2. Input Validation
    const { searchParams } = new URL(request.url);
    const startDateStr = searchParams.get("startDate");
    const endDateStr = searchParams.get("endDate");
    const level = searchParams.get("level") as "account" | "campaign" | "adset" | "ad" | null;
    const breakdownId = searchParams.get("breakdownId") || undefined;

    if (!startDateStr || !endDateStr) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "startDate and endDate are required" } },
        { status: 400 }
      );
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    // Validate dates are valid
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid date format" } },
        { status: 400 }
      );
    }

    // Validate level if provided
    if (level && !["account", "campaign", "adset", "ad"].includes(level)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid level. Must be account, campaign, adset, or ad" } },
        { status: 400 }
      );
    }

    // 3. Service Layer Call - Aggregates on-the-fly with in-memory caching
    const result = await dailyMetricsService.getDailyMetrics({
      startDate,
      endDate,
      level: level || "account",
      breakdownId,
    });

    // 4. Response Formatting
    return NextResponse.json(
      {
        data: result.data,
        meta: {
          timestamp: new Date().toISOString(),
          cached: result.cached,
          count: result.data.length,
          level: level || "account",
          breakdownId: breakdownId || null,
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, max-age=300", // 5 minutes
        },
      }
    );
  } catch (error) {
    // 5. Error Handling
    return handleApiError(error);
  }
}
