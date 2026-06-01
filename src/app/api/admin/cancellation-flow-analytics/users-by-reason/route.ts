import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";
import { handleApiError } from "@/lib/errors/handlers";
import { getCancellationFlowUsersByReason } from "@/services/admin/cancellationFlowAnalytics";
import {
  CANCELLATION_REASONS,
  OUTCOME_VALUES,
  type CancellationReason,
} from "@/models/CancellationFlowEvent";

const AEST_TIMEZONE = "Australia/Sydney";
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const querySchema = z.object({
  reason: z.enum([...CANCELLATION_REASONS] as [string, ...string[]]),
  outcome: z.enum([...OUTCOME_VALUES] as [string, ...string[]]).optional(),
  startDate: z.string().regex(YMD).optional(),
  endDate: z.string().regex(YMD).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/**
 * GET /api/admin/cancellation-flow-analytics/users-by-reason
 * Paginated user-level rows for a single cancellation reason, optionally
 * filtered by outcome and AEST-inclusive date range. Powers the
 * "Reason × outcome" drill-down modal.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("overview.view");
    if (guard instanceof NextResponse) return guard;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Invalid query parameters" } },
        { status: 400 }
      );
    }

    const { reason, outcome, startDate, endDate, page, limit } = parsed.data;
    const from = startDate ? fromZonedTime(`${startDate}T00:00:00`, AEST_TIMEZONE) : undefined;
    const to = endDate ? fromZonedTime(`${endDate}T00:00:00`, AEST_TIMEZONE) : undefined;
    const toExclusive = to ? addDays(to, 1) : undefined;

    const data = await getCancellationFlowUsersByReason({
      reason: reason as CancellationReason,
      outcome: outcome as "in_progress" | "saved" | "cancelled" | undefined,
      from,
      to: toExclusive,
      page,
      limit,
    });

    return NextResponse.json(
      {
        data,
        meta: { timestamp: new Date().toISOString() },
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, max-age=120" },
      }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
