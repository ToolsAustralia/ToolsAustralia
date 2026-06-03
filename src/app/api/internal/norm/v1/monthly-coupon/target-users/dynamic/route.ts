import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMonthlyCouponTargetUsersOpaqueSchema } from "@/lib/internal-norm/schemas/monthly-coupon";
import { TargetingService } from "@/services/redeemables";
import { monthlyCouponSegmentConfigSchema } from "@/lib/zod/monthlyCouponSegmentConfig";
import { z } from "zod";

const BodySchema = z.object({
  segmentConfig: monthlyCouponSegmentConfigSchema,
});

export const POST = withNorm(
  {
    tier: "read",
    registryKey: "monthly-coupon.target-users.dynamic",
    requiredPermission: "promos.view",
    responseSchema: NormMonthlyCouponTargetUsersOpaqueSchema,
  },
  async (ctx) => {
    let body: unknown;
    try {
      body = await ctx.request.json();
    } catch {
      return ctx.error(400, "bad_body", "Body must be valid JSON");
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return ctx.error(400, "bad_body", "Invalid body", parsed.error.issues);
    }

    const userIds = await TargetingService.resolveTargetUserIds({
      targetingMode: "dynamic-segment",
      segmentConfig: parsed.data.segmentConfig,
    });

    return ctx.ok({ userIds, count: userIds.length });
  },
);
