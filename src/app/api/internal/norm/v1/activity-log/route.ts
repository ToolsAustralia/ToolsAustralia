import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormActivityLogSchema } from "@/lib/internal-norm/schemas/activity-log";
import {
  getActivityLog,
  type ActivityLogItemType,
} from "@/services/admin/ActivityLogService";

const ACTIVITY_TYPES: readonly ActivityLogItemType[] = [
  "user_signup",
  "membership_purchase",
  "one_time_purchase",
  "draw_complete",
  "high_value_order",
  "system_alert",
  "membership_upgrade",
  "subscription_past_due",
] as const;

const QuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  type: z.enum(ACTIVITY_TYPES as unknown as [ActivityLogItemType, ...ActivityLogItemType[]]).optional(),
  search: z.string().max(200).optional(),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "activity-log.list",
    requiredPermission: "overview.view",
    responseSchema: NormActivityLogSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);

    const { activities, pagination } = await getActivityLog({
      page: parsed.data.page,
      limit: parsed.data.limit,
      typeFilter: parsed.data.type ?? null,
      searchTerm: parsed.data.search ?? null,
    });

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
          timestamp:
            a.timestamp instanceof Date
              ? a.timestamp.toISOString()
              : new Date(a.timestamp).toISOString(),
          status: a.status,
          amount: typeof a.amount === "number" ? a.amount : null,
          miniDrawId: a.miniDrawId ?? null,
        };
      }),
      pagination,
    });
  },
);
