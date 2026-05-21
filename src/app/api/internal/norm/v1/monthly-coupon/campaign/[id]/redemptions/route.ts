import mongoose from "mongoose";
import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMonthlyCouponCampaignRedemptionsSchema } from "@/lib/internal-norm/schemas/monthly-coupon";
import { RedemptionAnalyticsService } from "@/services/redeemables";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "monthly-coupon.campaign.redemptions",
    requiredPermission: "promos.view",
    responseSchema: NormMonthlyCouponCampaignRedemptionsSchema,
  },
  async (ctx) => {
    const id = ctx.param(1) ?? "";
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return ctx.error(400, "bad_path", "Invalid campaign id");
    }

    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    const result = await RedemptionAnalyticsService.getCampaignRedemptions(id, {
      page: parsed.data.page,
      limit: parsed.data.limit,
    });

    return ctx.ok({
      items: result.items.map((item) => ({
        issuanceId: item.issuanceId,
        userId: item.userId,
        redeemedAt: item.redeemedAt.toISOString(),
        code: item.code,
        entriesAmount: item.entriesAmount,
      })),
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    });
  },
);
