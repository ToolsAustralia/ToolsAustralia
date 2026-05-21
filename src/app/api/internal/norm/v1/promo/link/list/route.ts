import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormPromoLinkListSchema } from "@/lib/internal-norm/schemas/promo-sub-domains";
import { listPromoLinks } from "@/services/promo/PromoQueryService";

const QuerySchema = z.object({
  isActive: z.enum(["true", "false"]).optional(),
  expired: z.enum(["true", "false"]).optional(),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "promo.link.list",
    requiredPermission: "promos.view",
    responseSchema: NormPromoLinkListSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams));
    if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query", parsed.error.issues);

    const { data, count } = await listPromoLinks({
      isActive: parsed.data.isActive === undefined ? undefined : parsed.data.isActive === "true",
      expired: parsed.data.expired === undefined ? undefined : parsed.data.expired === "true",
    });

    return ctx.ok({
      data: data.map((row) => ({
        id: row.id,
        code: row.code,
        bonusEntries: row.bonusEntries,
        expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
        isActive: row.isActive,
        appliesToMembership: row.appliesToMembership,
        appliesToOneTime: row.appliesToOneTime,
        campaignType: row.campaignType,
        eligibilityAudience: row.eligibilityAudience,
        eligibilityRules: row.eligibilityRules,
        isExpired: row.isExpired,
        description: row.description,
        usageCount: row.usageCount,
        usedByCount: row.usedByCount,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        createdBy: row.createdBy,
      })),
      count,
    });
  },
);
