import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMonthlyCouponTargetUsersOpaqueSchema } from "@/lib/internal-norm/schemas/monthly-coupon";
import { TargetingService } from "@/services/redeemables";

const BodySchema = z.object({
  userIds: z.array(z.string()).min(1),
});

export const POST = withNorm(
  {
    tier: "read",
    registryKey: "monthly-coupon.target-users.manual",
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
      targetingMode: "manual-users",
      manualUserIds: parsed.data.userIds,
    });

    return ctx.ok({ userIds, count: userIds.length });
  },
);
