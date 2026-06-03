import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormPromoBonusEntryActiveSchema } from "@/lib/internal-norm/schemas/promo-sub-domains";
import { getActiveBonusEntryPromo } from "@/services/promo/PromoQueryService";

const QuerySchema = z.object({
  type: z.enum(["membership-packages", "one-time-packages", "mini-packages"]),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "promo.bonus-entry.active",
    requiredPermission: "promos.view",
    responseSchema: NormPromoBonusEntryActiveSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams));
    if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query", parsed.error.issues);

    const { data } = await getActiveBonusEntryPromo(parsed.data.type);
    return ctx.ok({
      data: data
        ? {
            id: data.id,
            type: data.type,
            bonusEntries: data.bonusEntries,
            startDate: data.startDate.toISOString(),
            endDate: data.endDate.toISOString(),
            isActive: data.isActive,
            isCurrentlyActive: data.isCurrentlyActive,
            isUpcoming: data.isUpcoming,
            isExpired: data.isExpired,
            description: data.description,
            createdAt: data.createdAt.toISOString(),
            updatedAt: data.updatedAt.toISOString(),
            createdBy: data.createdBy,
          }
        : null,
    });
  },
);
