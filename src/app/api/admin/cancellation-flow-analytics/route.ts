import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { handleApiError } from "@/lib/errors/handlers";
import { getCancellationFlowAnalytics } from "@/services/admin/cancellationFlowAnalytics";

const querySchema = z.object({
  from: z
    .string()
    .datetime({ offset: true })
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  to: z
    .string()
    .datetime({ offset: true })
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
});

/**
 * GET /api/admin/cancellation-flow-analytics
 * Read-only aggregated analytics for the cancellation flow.
 * Optional ?from=&to= ISO datetime window (validated; 400 on malformed input).
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authentication & Authorization (mirrors sibling admin analytics routes).
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Admin access required" } },
        { status: 401 }
      );
    }

    // 2. Input Validation
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Invalid from/to query parameter" } },
        { status: 400 }
      );
    }

    // 3. Service Layer Call
    const data = await getCancellationFlowAnalytics({
      from: parsed.data.from,
      to: parsed.data.to,
    });

    // 4. Response Formatting
    return NextResponse.json(
      {
        data,
        meta: { timestamp: new Date().toISOString() },
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, max-age=300" },
      }
    );
  } catch (error) {
    // 5. Error Handling
    return handleApiError(error);
  }
}
