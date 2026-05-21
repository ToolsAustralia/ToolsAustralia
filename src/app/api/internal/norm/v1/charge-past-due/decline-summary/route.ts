import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormChargePastDueDeclineSummarySchema } from "@/lib/internal-norm/schemas/charge-past-due";
import {
  parseAestDayStartUtc,
  parseAestDayEndExclusiveUtc,
  summariseDeclineCodes,
} from "@/services/admin/chargePastDueHistory";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const QuerySchema = z.object({
  startDate: z.string().regex(YMD).optional(),
  endDate: z.string().regex(YMD).optional(),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "charge-past-due.decline-summary",
    requiredPermission: "users.view",
    responseSchema: NormChargePastDueDeclineSummarySchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid startDate/endDate (expected YYYY-MM-DD)", parsed.error.issues);
    }
    const summary = await summariseDeclineCodes({
      startDate: parseAestDayStartUtc(parsed.data.startDate),
      endDate: parseAestDayEndExclusiveUtc(parsed.data.endDate),
    });
    return ctx.ok(summary);
  }
);
