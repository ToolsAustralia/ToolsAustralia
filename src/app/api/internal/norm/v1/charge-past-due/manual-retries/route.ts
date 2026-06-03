import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormChargePastDueManualRetriesListSchema } from "@/lib/internal-norm/schemas/charge-past-due";
import {
  listManualRetries,
  parseAestDayStartUtc,
  parseAestDayEndExclusiveUtc,
} from "@/services/admin/chargePastDueHistory";

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const RETRY_STATUS = ["success", "failed", "skipped"] as const;

const QuerySchema = z.object({
  startDate: z.string().regex(YMD).optional(),
  endDate: z.string().regex(YMD).optional(),
  adminId: z.string().optional(),
  status: z.enum(RETRY_STATUS).optional(),
  userSearch: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "charge-past-due.manual-retries.list",
    requiredPermission: "users.view",
    responseSchema: NormChargePastDueManualRetriesListSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }
    const result = await listManualRetries({
      startDate: parseAestDayStartUtc(parsed.data.startDate),
      endDate: parseAestDayEndExclusiveUtc(parsed.data.endDate),
      adminId: parsed.data.adminId,
      status: parsed.data.status,
      userSearch: parsed.data.userSearch,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
    return ctx.ok({
      total: result.total,
      rows: result.rows.map((r) => ({
        invoiceId: r.invoiceId,
        customerId: r.customerId,
        userId: r.userId,
        userEmail: r.userEmail,
        status: r.status,
        amount: r.amount,
        attemptedAt: r.attemptedAt.toISOString(),
        errorCode: r.errorCode,
        declineCode: r.declineCode,
        errorMessage: r.errorMessage,
        adminId: r.adminId,
        adminName: r.adminName,
      })),
    });
  }
);
