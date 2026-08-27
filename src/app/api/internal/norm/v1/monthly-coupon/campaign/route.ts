import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMonthlyCouponCampaignsListSchema } from "@/lib/internal-norm/schemas/monthly-coupon";
import { listCampaignsWithRedemptionCounts } from "@/services/redeemables";

const QuerySchema = z.object({
  monthKey: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "monthly-coupon.campaigns.list",
    requiredPermission: "promos.view",
    responseSchema: NormMonthlyCouponCampaignsListSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query", parsed.error.issues);
    }
    const rows = await listCampaignsWithRedemptionCounts(
      parsed.data.monthKey ? { monthKey: parsed.data.monthKey } : undefined,
    );
    return ctx.ok({
      data: rows.map((row) => ({
        id: row.id,
        monthKey: row.monthKey,
        name: row.name,
        displayLabel: row.displayLabel,
        entriesAmount: row.entriesAmount,
        campaignMode: row.campaignMode,
        targetingMode: row.targetingMode,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt ? row.endsAt.toISOString() : null,
        neverExpires: row.neverExpires,
        validForHours: row.validForHours,
        isActive: row.isActive,
        code: row.code,
        requiresPurchase: row.requiresPurchase,
        purchaseRequirement: row.purchaseRequirement,
        segmentConfig: row.segmentConfig
          ? {
              minInactiveDays: row.segmentConfig.minInactiveDays,
              maxInactiveDays: row.segmentConfig.maxInactiveDays,
              requiresEmailVerified: row.segmentConfig.requiresEmailVerified,
              requiresRecentPurchaseDays: row.segmentConfig.requiresRecentPurchaseDays,
              includeUserIdsCount: row.segmentConfig.includeUserIds?.length,
              excludeUserIdsCount: row.segmentConfig.excludeUserIds?.length,
              states: row.segmentConfig.states,
              membershipTiers: row.segmentConfig.membershipTiers,
              topEntriesPercent: row.segmentConfig.topEntriesPercent,
            }
          : undefined,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        redeemedCount: row.redeemedCount,
        issuanceCount: row.issuanceCount,
      })),
      count: rows.length,
    });
  },
);
