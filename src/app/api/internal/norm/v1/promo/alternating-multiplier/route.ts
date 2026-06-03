import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormPromoAlternatingMultiplierListSchema } from "@/lib/internal-norm/schemas/promo-sub-domains";
import { listAlternatingMultipliers } from "@/services/promo/PromoQueryService";

const QuerySchema = z.object({
  type: z.enum(["membership-packages", "one-time-packages", "mini-packages"]).optional(),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "promo.alternating-multiplier.list",
    requiredPermission: "promos.view",
    responseSchema: NormPromoAlternatingMultiplierListSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams));
    if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query", parsed.error.issues);

    const { data, count } = await listAlternatingMultipliers(parsed.data.type);
    return ctx.ok({
      data: data.map((row) => ({
        id: row.id,
        type: row.type,
        multipliers: row.multipliers,
        isEnabled: row.isEnabled,
        description: row.description,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        createdBy: row.createdBy,
      })),
      count,
    });
  },
);
