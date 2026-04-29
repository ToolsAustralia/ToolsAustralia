import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { UserMetricsService } from "@/services/metrics/UserMetricsService";
import { DailyUserMetricsService } from "@/services/metrics/DailyUserMetricsService";
import { handleApiError } from "@/lib/errors/handlers";
import { z } from "zod";
import { parseAdminDashboardDateRange } from "@/utils/admin/dashboardDateRange";

const userMetricsService = new UserMetricsService();
const dailyUserMetricsService = new DailyUserMetricsService();

const userMetricsQuerySchema = z.object({
  startDate: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
  endDate: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
  groupBy: z.enum(["source", "profession", "status"]).optional(),
  daily: z.string().optional().transform((val) => val === "true"),
});

/**
 * GET /api/admin/metrics/users
 * Get aggregated user metrics
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

    const validatedQuery = userMetricsQuerySchema.parse(queryParams);

    // 3. Service Layer Call
    // If daily=true, return daily metrics; otherwise return aggregate metrics
    if (validatedQuery.daily && validatedQuery.startDate && validatedQuery.endDate) {
      const dailyResult = await dailyUserMetricsService.getDailyUserMetrics({
        startDate: validatedQuery.startDate,
        endDate: validatedQuery.endDate,
      });

      return NextResponse.json(
        {
          data: dailyResult.data,
          meta: {
            timestamp: new Date().toISOString(),
            cached: dailyResult.cached,
            count: dailyResult.data.length,
            daily: true,
          },
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "private, max-age=300", // 5 minutes
          },
        }
      );
    }

    // Derive asOfDate for snapshot mode using the shared date-range parser.
    const parsedRange = parseAdminDashboardDateRange({
      dateRange: searchParams.get("dateRange"),
      startDateParam: searchParams.get("startDate"),
      endDateParam: searchParams.get("endDate"),
    });
    const asOfDate = parsedRange.ok ? parsedRange.value.asOfDate : null;

    // Aggregate metrics (original behavior)
    const result = await userMetricsService.getUserMetrics({
      startDate: validatedQuery.startDate,
      endDate: validatedQuery.endDate,
      groupBy: validatedQuery.groupBy,
      asOfDate,
    });

    // Count total users for meta
    const totalUsers = Object.values(result.signupSource).reduce((sum, count) => sum + count, 0);

    // 4. Response Formatting
    return NextResponse.json(
      {
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          totalUsers,
          daily: false,
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


