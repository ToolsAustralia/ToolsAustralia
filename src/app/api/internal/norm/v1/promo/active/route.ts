import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormPromoActiveSchema } from "@/lib/internal-norm/schemas/promo";
import { listActivePromos } from "@/services/promo/PromoQueryService";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "promo.active",
    requiredPermission: "promos.view",
    responseSchema: NormPromoActiveSchema,
  },
  async (ctx) => {
    const { data, count } = await listActivePromos();
    return ctx.ok({
      data: data.map((row) => ({
        id: row.id,
        type: row.type,
        multiplier: row.multiplier,
        startDate: row.startDate.toISOString(),
        endDate: row.endDate.toISOString(),
        duration: row.duration,
        isActive: true as const,
        timeRemaining: 0 as const,
        isExpired: false as const,
        createdAt: row.createdAt.toISOString(),
      })),
      count,
    });
  },
);
