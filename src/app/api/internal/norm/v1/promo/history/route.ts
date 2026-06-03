import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormPromoHistorySchema } from "@/lib/internal-norm/schemas/promo";
import { listPromoHistory } from "@/services/promo/PromoQueryService";

const QuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 10)),
  type: z.enum(["membership-packages", "one-time-packages", "mini-packages"]).optional(),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "promo.history",
    requiredPermission: "promos.view",
    responseSchema: NormPromoHistorySchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    const result = await listPromoHistory(parsed.data);

    return ctx.ok({
      data: result.data.map((row) => ({
        id: row.id,
        type: row.type,
        multiplier: row.multiplier,
        startDate: row.startDate ? row.startDate.toISOString() : undefined,
        endDate: row.endDate ? row.endDate.toISOString() : undefined,
        duration: row.duration,
        isActive: row.isActive,
        isExpired: row.isExpired,
        timeRemaining: row.timeRemaining,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        createdBy: row.createdBy,
      })),
      pagination: result.pagination,
    });
  },
);
