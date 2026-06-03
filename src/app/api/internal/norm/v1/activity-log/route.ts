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
  "upsell_accepted",
  "draw_complete",
  "high_value_order",
  "system_alert",
  "membership_upgrade",
  "subscription_past_due",
  "cancellation_offer_accepted",
  "admin_role_update",
  "affiliate_payout",
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

    // PII-safe projection: firstName comes from the service as a separate field
    // (never split from the combined "user" display string — that breaks compound
    // first names like "Jean Pierre"). lastName/email never enter this response.
    // `admin_role_update` actions embed the acting staff member's email for the
    // admin UI — redact it here so no email round-trips through Norm.
    return ctx.ok({
      activities: activities.map((a) => {
        const action =
          a.type === "admin_role_update" ? "A staff member was updated" : a.action;
        return {
          id: a.id,
          type: a.type,
          firstName: a.firstName,
          userId: a.userId ?? null,
          action,
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
