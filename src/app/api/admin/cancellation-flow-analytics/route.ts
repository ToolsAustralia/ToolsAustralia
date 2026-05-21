import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";
import { authOptions } from "@/lib/auth";
import { handleApiError } from "@/lib/errors/handlers";
import { getCancellationFlowAnalytics } from "@/services/admin/cancellationFlowAnalytics";

const AEST_TIMEZONE = "Australia/Sydney";
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const querySchema = z.object({
  startDate: z.string().regex(YMD).optional(),
  endDate: z.string().regex(YMD).optional(),
});

/**
 * GET /api/admin/cancellation-flow-analytics
 * Read-only aggregated analytics for the cancellation flow.
 * Optional ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD window (AEST-inclusive).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Admin access required" } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Invalid startDate/endDate (expected YYYY-MM-DD)" } },
        { status: 400 }
      );
    }

    const { startDate, endDate } = parsed.data;
    const from = startDate ? fromZonedTime(`${startDate}T00:00:00`, AEST_TIMEZONE) : undefined;
    // endDate is inclusive; convert to start of the next AEST day for the exclusive upper bound.
    const to = endDate
      ? fromZonedTime(`${endDate}T00:00:00`, AEST_TIMEZONE)
      : undefined;
    const toExclusive = to ? addDays(to, 1) : undefined;

    const data = await getCancellationFlowAnalytics({ from, to: toExclusive });

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
    return handleApiError(error);
  }
}
