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

    // PII-safe projection: firstName comes from the service as a separate field
    // (never split from the combined "user" display string — that breaks compound
    // first names like "Jean Pierre"). lastName/email never enter this response.
    return ctx.ok({
      activities: activities.map((a) => {
        return {
          id: a.id,
          type: a.type,
          firstName: a.firstName,
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
