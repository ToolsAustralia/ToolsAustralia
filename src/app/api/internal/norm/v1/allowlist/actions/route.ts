import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormAllowlistActionsListSchema } from "@/lib/internal-norm/schemas/allowlist";
import { getAllowlistService } from "@/services/allowlist";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  action: z.enum(["added", "skipped", "removed", "all"]).default("all"),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "allowlist.actions.list",
    requiredPermission: "users.view",
    responseSchema: NormAllowlistActionsListSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }
    const actions = await getAllowlistService().listActions(parsed.data);
    return ctx.ok({
      actions: actions.map((a) => ({
        id: String(a._id),
        cardFingerprint: String(a.cardFingerprint),
        cardLast4: String(a.cardLast4),
        cardBrand: String(a.cardBrand),
        userId: a.userId ? String(a.userId) : null,
        action: a.action as "added" | "skipped" | "removed",
        reason: a.reason as
          | "auto_eligible"
          | "manual_admin"
          | "manual_admin_override"
          | "filter_not_member"
          | "filter_fraud_signal"
          | "filter_permanent_issue"
          | "manual_reversal",
        declineCode: (a.declineCode as string | null) ?? null,
        failureCode: (a.failureCode as string | null) ?? null,
        triggeringPaymentIntentId: (a.triggeringPaymentIntentId as string | null) ?? null,
        triggeringChargeId: (a.triggeringChargeId as string | null) ?? null,
        stripeListItemId: (a.stripeListItemId as string | null) ?? null,
        source: a.source as "webhook" | "admin_bulk" | "admin_reversal",
        performedByUserId: a.performedByUserId ? String(a.performedByUserId) : null,
        createdAt: new Date(a.createdAt as string | Date).toISOString(),
      })),
    });
  }
);
