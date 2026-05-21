import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormPromoBannerTextActiveSchema } from "@/lib/internal-norm/schemas/promo-sub-domains";
import { PromoBannerTextService } from "@/services/admin/PromoBannerTextService";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "promo.banner-text.active",
    requiredPermission: "promos.view",
    responseSchema: NormPromoBannerTextActiveSchema,
  },
  async (ctx) => {
    const service = new PromoBannerTextService();
    const row = await service.getActiveBannerTextProjection();
    return ctx.ok({
      data: row
        ? {
            id: row.id,
            imageUrl: row.imageUrl,
            altText: row.altText,
            scheduleType: row.scheduleType,
            startDate: row.startDate ? row.startDate.toISOString() : null,
            endDate: row.endDate ? row.endDate.toISOString() : null,
            recurrencePattern: row.recurrencePattern,
            isActive: row.isActive,
            description: row.description,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            createdBy: row.createdBy,
          }
        : null,
    });
  },
);
