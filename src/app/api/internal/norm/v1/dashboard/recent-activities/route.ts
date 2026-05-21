import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormRecentActivitiesSchema } from "@/lib/internal-norm/schemas/dashboard";
import { getRecentActivities } from "@/services/admin/dashboardSlices";

const QuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "dashboard.recent-activities",
    requiredPermission: "overview.view",
    responseSchema: NormRecentActivitiesSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);

    const { activities, pagination } = await getRecentActivities(parsed.data);

    // PII-safe projection: firstName only (split off the admin "user" combined string),
    // strip email/lastName, keep opaque userId.
    return ctx.ok({
      activities: activities.map((a) => {
        const isSystem = a.user === "System";
        const firstName = isSystem ? null : a.user.split(" ")[0] || null;
        return {
          id: a.id,
          type: a.type,
          firstName,
          userId: a.userId ?? null,
          action: a.action,
          time: a.time,
          timestamp: a.timestamp instanceof Date ? a.timestamp.toISOString() : new Date(a.timestamp).toISOString(),
          status: a.status,
          amount: typeof a.amount === "number" ? a.amount : null,
          miniDrawId: a.miniDrawId ?? null,
        };
      }),
      pagination,
    });
  },
);
