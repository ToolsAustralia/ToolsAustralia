import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormPromoBonusEntryListSchema } from "@/lib/internal-norm/schemas/promo-sub-domains";
import { listBonusEntryPromos } from "@/services/promo/PromoQueryService";

const QuerySchema = z.object({
  type: z.enum(["membership-packages", "one-time-packages", "mini-packages"]).optional(),
  isActive: z.enum(["true", "false"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "promo.bonus-entry.list",
    requiredPermission: "promos.view",
    responseSchema: NormPromoBonusEntryListSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams));
    if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query", parsed.error.issues);

    const { data, count } = await listBonusEntryPromos({
      type: parsed.data.type,
      isActive: parsed.data.isActive === undefined ? undefined : parsed.data.isActive === "true",
      dateFrom: parsed.data.dateFrom ? new Date(parsed.data.dateFrom) : undefined,
      dateTo: parsed.data.dateTo ? new Date(parsed.data.dateTo) : undefined,
    });

    return ctx.ok({
      data: data.map((row) => ({
        id: row.id,
        type: row.type,
        bonusEntries: row.bonusEntries,
        startDate: row.startDate.toISOString(),
        endDate: row.endDate.toISOString(),
        isActive: row.isActive,
        isCurrentlyActive: row.isCurrentlyActive,
        isUpcoming: row.isUpcoming,
        isExpired: row.isExpired,
        description: row.description,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        createdBy: row.createdBy,
      })),
      count,
    });
  },
);
