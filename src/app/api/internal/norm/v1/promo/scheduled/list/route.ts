import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormPromoScheduledListSchema } from "@/lib/internal-norm/schemas/promo-sub-domains";
import { listScheduledPromos } from "@/services/promo/PromoQueryService";

const QuerySchema = z.object({
  type: z.enum(["membership-packages", "one-time-packages", "mini-packages"]).optional(),
  isActive: z.enum(["true", "false"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  includeDeleted: z.enum(["true", "false"]).optional(),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "promo.scheduled.list",
    requiredPermission: "promos.view",
    responseSchema: NormPromoScheduledListSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams));
    if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query", parsed.error.issues);

    const { data, count } = await listScheduledPromos({
      type: parsed.data.type,
      isActive: parsed.data.isActive === undefined ? undefined : parsed.data.isActive === "true",
      dateFrom: parsed.data.dateFrom ? new Date(parsed.data.dateFrom) : undefined,
      dateTo: parsed.data.dateTo ? new Date(parsed.data.dateTo) : undefined,
      includeDeleted: parsed.data.includeDeleted === "true",
    });

    return ctx.ok({
      data: data.map((row) => ({
        id: row.id,
        type: row.type,
        multiplier: row.multiplier,
        startDate: row.startDate.toISOString(),
        endDate: row.endDate.toISOString(),
        isActive: row.isActive,
        isCurrentlyActive: row.isCurrentlyActive,
        isUpcoming: row.isUpcoming,
        isExpired: row.isExpired,
        name: row.name,
        description: row.description,
        deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        createdBy: row.createdBy,
      })),
      count,
    });
  },
);
