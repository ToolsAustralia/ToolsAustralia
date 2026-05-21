import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormUsersPaymentEventsListSchema } from "@/lib/internal-norm/schemas/users";
import {
  listUserPaymentEvents,
  isValidUserObjectId,
} from "@/services/admin/UserAdminQueryService";

const QuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(25),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "users.payment-events.list",
    requiredPermission: "users.view",
    responseSchema: NormUsersPaymentEventsListSchema,
  },
  async (ctx) => {
    // /api/internal/norm/v1/users/<id>/payment-events
    const parts = ctx.url.pathname.split("/").filter(Boolean);
    const id = parts[parts.length - 2] ?? "";
    if (!id) return ctx.error(400, "bad_path", "Missing user id");
    if (!isValidUserObjectId(id)) return ctx.error(400, "bad_path", "Invalid user id");

    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);

    const result = await listUserPaymentEvents({
      userId: id,
      page: parsed.data.page,
      limit: parsed.data.limit,
    });
    if (!result) return ctx.error(404, "not_found", "User not found");

    return ctx.ok({
      events: result.events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        paymentIntentId: e.paymentIntentId ?? null,
        hasRefundProcessed: e.hasRefundProcessed,
        refundProcessedAt: e.refundProcessedAt ?? null,
        timestamp: e.timestamp,
        packageType: e.packageType ?? null,
        packageId: e.packageId ?? null,
        packageName: e.packageName ?? null,
        amount: typeof e.amount === "number" ? e.amount : null,
        stripeChargeId: e.stripeChargeId ?? null,
      })),
      page: result.page,
      limit: result.limit,
      total: result.total,
      hasMore: result.hasMore,
    });
  },
);
