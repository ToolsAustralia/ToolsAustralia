import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormCancellationFlowAnalyticsSchema } from "@/lib/internal-norm/schemas/cancellation-flow";
import { getCancellationFlowAnalytics } from "@/services/admin/cancellationFlowAnalytics";

const AEST_TIMEZONE = "Australia/Sydney";
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const QuerySchema = z.object({
  startDate: z.string().regex(YMD).optional(),
  endDate: z.string().regex(YMD).optional(),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "cancellation-flow-analytics.list",
    requiredPermission: "overview.view",
    responseSchema: NormCancellationFlowAnalyticsSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(
      Object.fromEntries(ctx.url.searchParams.entries())
    );
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid startDate/endDate (expected YYYY-MM-DD)", parsed.error.issues);
    }

    const { startDate, endDate } = parsed.data;
    const from = startDate
      ? fromZonedTime(`${startDate}T00:00:00`, AEST_TIMEZONE)
      : undefined;
    // endDate is inclusive; convert to start of the next AEST day for the exclusive upper bound.
    const to = endDate
      ? fromZonedTime(`${endDate}T00:00:00`, AEST_TIMEZONE)
      : undefined;
    const toExclusive = to ? addDays(to, 1) : undefined;

    const data = await getCancellationFlowAnalytics({ from, to: toExclusive });
    return ctx.ok(data);
  }
);
