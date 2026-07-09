import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormUsersGetSchema } from "@/lib/internal-norm/schemas/users";
import {
  getAdminUserDetail,
  isValidUserObjectId,
} from "@/services/admin/UserAdminQueryService";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "users.get",
    requiredPermission: "users.view",
    responseSchema: NormUsersGetSchema,
  },
  async (ctx) => {
    const id = ctx.param(0) ?? "";
    if (!id) return ctx.error(400, "bad_path", "Missing user id");
    if (!isValidUserObjectId(id)) return ctx.error(400, "bad_path", "Invalid user id");

    const detail = await getAdminUserDetail(id);
    if (!detail) return ctx.error(404, "not_found", "User not found");

    // PII-safe projection: firstName + opaque userId + state only. Email,
    // lastName, mobile, savedPaymentMethods, full referral history, raw orders,
    // partner-discount queue, redemption history, miniDraw participation arrays
    // are intentionally stripped — Norm gets statistics counts only. The added
    // partnerAccessRing / nextRenewalEntries / cancelledAt are derived signals
    // (tier %, entry count, ISO date) — no new PII.
    return ctx.ok({
      userId: detail.id,
      firstName: detail.firstName || null,
      state: detail.state ?? null,
      role: detail.role,
      isActive: detail.isActive,
      isEmailVerified: detail.isEmailVerified,
      isMobileVerified: detail.isMobileVerified ?? null,
      profileSetupCompleted: detail.profileSetupCompleted ?? null,
      acceptsPromotionalEmail: detail.acceptsPromotionalEmail ?? null,
      createdAt: detail.createdAt instanceof Date ? detail.createdAt.toISOString() : String(detail.createdAt),
      updatedAt: detail.updatedAt instanceof Date ? detail.updatedAt.toISOString() : String(detail.updatedAt),
      lastLogin: detail.lastLogin ? new Date(detail.lastLogin).toISOString() : null,
      subscription: detail.subscription
        ? {
            packageId: detail.subscription.packageId,
            packageName: detail.subscription.packageName,
            isActive: detail.subscription.isActive,
            startDate: detail.subscription.startDate
              ? new Date(detail.subscription.startDate).toISOString()
              : null,
            endDate: detail.subscription.endDate
              ? new Date(detail.subscription.endDate).toISOString()
              : null,
            cancelledAt: detail.subscription.cancelledAt
              ? new Date(detail.subscription.cancelledAt).toISOString()
              : null,
            status: detail.subscription.status ?? null,
            autoRenew: detail.subscription.autoRenew ?? null,
            lastMonthAccumulatedEntries: detail.subscription.lastMonthAccumulatedEntries ?? null,
            nextRenewalEntries: detail.subscription.nextRenewalEntries ?? null,
            renewalLandsInCurrentDraw: detail.subscription.renewalLandsInCurrentDraw ?? false,
          }
        : null,
      partnerAccessRing: {
        state: detail.partnerAccessRing.state,
        percent: detail.partnerAccessRing.percent,
        expiryLabel: detail.partnerAccessRing.expiryLabel,
      },
      statistics: {
        totalSpent: detail.totalSpent,
        totalOrders: detail.totalOrders,
        totalOrderValue: detail.totalOrderValue,
        currentDrawEntries: detail.currentDrawEntries,
        accountAgeDays: detail.accountAgeDays,
        daysSinceLastLogin: detail.daysSinceLastLogin,
        paymentEventsTotal: detail.paymentEventsTotal,
      },
      rewardsPoints: detail.rewardsPoints,
      accumulatedEntries: detail.accumulatedEntries,
    });
  },
);
