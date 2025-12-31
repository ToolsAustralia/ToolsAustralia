import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { dailyMetricsQuerySchema } from "@/schemas/metrics/DailyMetricsSchema";
import { DailyMetricsService } from "@/services/metrics/DailyMetricsService";
import { handleApiError } from "@/lib/errors/handlers";

const dailyMetricsService = new DailyMetricsService();

/**
 * GET /api/admin/metrics/daily
 * Fetch daily metrics for a date range
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
    const queryParams = Object.fromEntries(searchParams.entries());

    const validatedQuery = dailyMetricsQuerySchema.parse(queryParams);

    // 3. Service Layer Call
    const result = await dailyMetricsService.getDailyMetrics({
      startDate: validatedQuery.startDate,
      endDate: validatedQuery.endDate,
    });

    // 4. Response Formatting
    return NextResponse.json(
      {
        data: result.data,
        meta: {
          timestamp: new Date().toISOString(),
          cached: result.cached,
          count: result.data.length,
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

/**
 * POST /api/admin/metrics/daily
 * Trigger aggregation for a date range (can be called by cron job)
 */
export async function POST(request: NextRequest) {
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
    const body = await request.json().catch(() => ({}));
    const validatedQuery = dailyMetricsQuerySchema.parse(body);

    // 3. Service Layer Call - Ensure metrics are aggregated
    await dailyMetricsService.ensureDailyMetricsAggregated(
      validatedQuery.startDate,
      validatedQuery.endDate
    );

    // 4. Response Formatting
    return NextResponse.json(
      {
        message: "Daily metrics aggregation completed",
        meta: {
          timestamp: new Date().toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    // 5. Error Handling
    return handleApiError(error);
  }
}

