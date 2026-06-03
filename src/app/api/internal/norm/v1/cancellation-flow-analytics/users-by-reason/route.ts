import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormCancellationUsersByReasonSchema } from "@/lib/internal-norm/schemas/cancellation-flow";
import { getCancellationFlowUsersByReason } from "@/services/admin/cancellationFlowAnalytics";
import {
  CANCELLATION_REASONS,
  OUTCOME_VALUES,
  type CancellationReason,
} from "@/models/CancellationFlowEvent";

const AEST_TIMEZONE = "Australia/Sydney";
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const QuerySchema = z.object({
  reason: z.enum([...CANCELLATION_REASONS] as [string, ...string[]]),
  outcome: z.enum([...OUTCOME_VALUES] as [string, ...string[]]).optional(),
  startDate: z.string().regex(YMD).optional(),
  endDate: z.string().regex(YMD).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/**
 * GET /v1/cancellation-flow-analytics/users-by-reason
 *
 * PII-safe Norm mirror of the admin "Reason × outcome" drill-down. Returns
 * paginated user-level rows for a single cancellation reason, optionally
 * filtered by outcome and an AEST-inclusive date range.
 *
 * The underlying admin row carries `userEmail` + `userLastName`; the projection
 * below strips both. Norm sees `firstName` + opaque `userId` ONLY.
 */
export const GET = withNorm(
  {
    tier: "read",
    registryKey: "cancellation-flow-analytics.users-by-reason",
    requiredPermission: "overview.view",
    responseSchema: NormCancellationUsersByReasonSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(
      Object.fromEntries(ctx.url.searchParams.entries())
    );
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    const { reason, outcome, startDate, endDate, page, limit } = parsed.data;
    const from = startDate
      ? fromZonedTime(`${startDate}T00:00:00`, AEST_TIMEZONE)
      : undefined;
    // endDate is inclusive; convert to start of the next AEST day for the exclusive upper bound.
    const to = endDate
      ? fromZonedTime(`${endDate}T00:00:00`, AEST_TIMEZONE)
      : undefined;
    const toExclusive = to ? addDays(to, 1) : undefined;

    const { rows, totalCount } = await getCancellationFlowUsersByReason({
      reason: reason as CancellationReason,
      outcome: outcome as "in_progress" | "saved" | "cancelled" | undefined,
      from,
      to: toExclusive,
      page,
      limit,
    });

    // PII-safe projection: keep firstName + opaque userId; drop userEmail and
    // userLastName entirely so no email/lastName ever round-trips through Norm.
    return ctx.ok({
      rows: rows.map((row) => ({
        eventId: row.eventId,
        userId: row.userId ?? null,
        firstName: row.userFirstName ?? null,
        startedAt: row.startedAt,
        outcome: row.outcome,
        reasonText: row.reasonText ?? null,
        offerAccepted: row.offerAccepted ?? null,
      })),
      totalCount,
    });
  }
);
