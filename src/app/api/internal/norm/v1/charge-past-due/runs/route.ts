import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormChargePastDueRunsListSchema } from "@/lib/internal-norm/schemas/charge-past-due";
import {
  listChargeRuns,
  parseAestDayStartUtc,
  parseAestDayEndExclusiveUtc,
} from "@/services/admin/chargePastDueHistory";

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const RUN_STATUS = ["running", "completed", "failed", "aborted"] as const;

const QuerySchema = z.object({
  startDate: z.string().regex(YMD).optional(),
  endDate: z.string().regex(YMD).optional(),
  adminId: z.string().optional(),
  status: z.enum(RUN_STATUS).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "charge-past-due.runs.list",
    requiredPermission: "users.view",
    responseSchema: NormChargePastDueRunsListSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }
    const result = await listChargeRuns({
      startDate: parseAestDayStartUtc(parsed.data.startDate),
      endDate: parseAestDayEndExclusiveUtc(parsed.data.endDate),
      adminId: parsed.data.adminId,
      status: parsed.data.status,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
    return ctx.ok({
      total: result.total,
      runs: result.runs.map((r) => ({
        id: r._id,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
        durationMs: r.durationMs,
        adminId: r.adminId,
        adminName: r.adminName,
        status: r.status,
        totals: r.totals,
      })),
    });
  }
);
