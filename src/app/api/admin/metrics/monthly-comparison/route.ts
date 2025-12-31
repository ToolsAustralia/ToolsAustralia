import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { monthlyComparisonQuerySchema } from "@/schemas/metrics/MonthlyComparisonSchema";
import { MonthlyComparisonService } from "@/services/metrics/MonthlyComparisonService";
import { handleApiError } from "@/lib/errors/handlers";

const monthlyComparisonService = new MonthlyComparisonService();

/**
 * GET /api/admin/metrics/monthly-comparison
 * Get monthly comparison data for a specific month
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

    // Default to current month if not provided
    if (!queryParams.month) {
      const now = new Date();
      queryParams.month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }

    const validatedQuery = monthlyComparisonQuerySchema.parse(queryParams);

    // 3. Service Layer Call
    const result = await monthlyComparisonService.getMonthlyComparison(validatedQuery.month);

    // 4. Response Formatting
    return NextResponse.json(
      {
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          month: validatedQuery.month,
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, max-age=900", // 15 minutes
        },
      }
    );
  } catch (error) {
    // 5. Error Handling
    return handleApiError(error);
  }
}

