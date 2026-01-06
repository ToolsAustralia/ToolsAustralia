import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { UserMajorDrawComparisonService } from "@/services/metrics/UserMajorDrawComparisonService";
import { handleApiError } from "@/lib/errors/handlers";
import { z } from "zod";

const userMajorDrawComparisonService = new UserMajorDrawComparisonService();

const userMajorDrawComparisonQuerySchema = z.object({
  currentDrawId: z.string().min(1, "Current draw ID is required"),
  previousDrawId: z.string().min(1, "Previous draw ID is required"),
});

/**
 * GET /api/admin/metrics/users/major-draw-comparison
 * Get user metrics comparison data between two major draws
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

    const validatedQuery = userMajorDrawComparisonQuerySchema.parse(queryParams);

    // 3. Service Layer Call
    const result = await userMajorDrawComparisonService.getUserMajorDrawComparison(
      validatedQuery.currentDrawId,
      validatedQuery.previousDrawId
    );

    // 4. Response Formatting
    return NextResponse.json(
      {
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          currentDrawId: validatedQuery.currentDrawId,
          previousDrawId: validatedQuery.previousDrawId,
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

