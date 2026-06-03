import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMonthlyCouponTargetUsersFilterSchema } from "@/lib/internal-norm/schemas/monthly-coupon";
import { filterCampaignAudience } from "@/services/redeemables";

const BodySchema = z.object({
  subscriptionStatus: z.enum(["active", "inactive", "any"]).optional(),
  membershipTiers: z
    .array(z.enum(["tradie-subscription", "foreman-subscription", "boss-subscription"]))
    .optional(),
  states: z.array(z.string().trim().min(2).max(3)).optional(),
  requiresEmailVerified: z.boolean().optional(),
  topEntriesPercent: z.number().int().min(1).max(100).optional(),
  searchQuery: z.string().max(200).optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  returnMatchingUserIds: z.boolean().optional(),
});

export const POST = withNorm(
  {
    tier: "read",
    registryKey: "monthly-coupon.target-users.filter",
    requiredPermission: "promos.view",
    responseSchema: NormMonthlyCouponTargetUsersFilterSchema,
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

    const result = await filterCampaignAudience(parsed.data);

    if (result.mode === "bulk-too-large") {
      return ctx.error(
        400,
        "too_many_matches",
        `Too many matches (${result.totalCount}). Narrow filters (maximum ${result.cap}).`,
        { totalCount: result.totalCount, cap: result.cap },
      );
    }

    if (result.mode === "bulk") {
      return ctx.ok({
        mode: "bulk" as const,
        userIds: result.userIds,
        totalCount: result.totalCount,
      });
    }

    // PII-safe projection: strip firstName/lastName/email/role/isActive/isEmailVerified
    // /createdAt/lastLogin from the per-user rows; keep opaque id + state + subscription
    // tier + majorDrawEntries (the audience-decision signals).
    return ctx.ok({
      mode: "page" as const,
      users: result.users.map((u) => ({
        userId: u.id,
        state: u.state,
        subscription: u.subscription
          ? {
              packageId: u.subscription.packageId,
              isActive: u.subscription.isActive,
              status: u.subscription.status,
            }
          : null,
        majorDrawEntries: u.majorDrawEntries,
      })),
      pagination: result.pagination,
      ...(result.warning ? { warning: result.warning } : {}),
    });
  },
);
