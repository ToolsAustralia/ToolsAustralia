import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormUsersListSchema } from "@/lib/internal-norm/schemas/users";
import { listAdminUsers } from "@/services/admin/UserAdminQueryService";

const QuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  search: z.string().max(200).optional(),
  subscriptionStatus: z.string().max(50).optional(),
  autoRenew: z.enum(["true", "false"]).optional(),
  membershipPackage: z.string().max(100).optional(),
  role: z.enum(["user", "admin"]).optional(),
  dateFrom: z.string().max(50).optional(),
  dateTo: z.string().max(50).optional(),
  state: z.string().max(10).optional(),
  inActiveMajorDraw: z.enum(["yes", "no"]).optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "users.list",
    requiredPermission: "users.view",
    responseSchema: NormUsersListSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);

    // `state` may be repeated; pick all occurrences.
    const states = ctx.url.searchParams.getAll("state").map((s) => s.trim()).filter(Boolean);

    const result = await listAdminUsers({
      page: parsed.data.page,
      limit: parsed.data.limit,
      search: parsed.data.search,
      subscriptionStatus: parsed.data.subscriptionStatus,
      autoRenew: parsed.data.autoRenew,
      membershipPackage: parsed.data.membershipPackage,
      role: parsed.data.role,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      states,
      inActiveMajorDraw: parsed.data.inActiveMajorDraw,
      sortBy: parsed.data.sortBy,
      sortOrder: parsed.data.sortOrder,
    });

    // PII-safe projection: firstName + opaque userId only — strip email/lastName/mobile.
    return ctx.ok({
      users: result.users.map((u) => ({
        userId: u.id,
        firstName: u.firstName || null,
        state: u.state ?? null,
        role: u.role,
        isActive: u.isActive,
        isEmailVerified: u.isEmailVerified,
        isMobileVerified: u.isMobileVerified ?? null,
        profileSetupCompleted: u.profileSetupCompleted ?? null,
        createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt),
        lastLogin: u.lastLogin ? new Date(u.lastLogin).toISOString() : null,
        subscription: u.subscription
          ? {
              packageId: u.subscription.packageId,
              packageName: u.subscription.packageName,
              isActive: u.subscription.isActive,
              startDate:
                u.subscription.startDate instanceof Date
                  ? u.subscription.startDate.toISOString()
                  : String(u.subscription.startDate),
              endDate: u.subscription.endDate
                ? new Date(u.subscription.endDate).toISOString()
                : null,
              status: u.subscription.status ?? null,
              autoRenew: null,
              lastMonthAccumulatedEntries: u.subscription.lastMonthAccumulatedEntries ?? null,
              streakMonths: u.subscription.streakMonths ?? 0,
            }
          : null,
        totalSpent: u.totalSpent,
        majorDrawEntries: u.majorDrawEntries,
        miniDrawCount: u.miniDrawCount,
        rewardsPoints: u.rewardsPoints,
        accumulatedEntries: u.accumulatedEntries,
      })),
      stats: result.stats,
      pagination: result.pagination,
    });
  },
);
