import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormRepeatPurchaseSummarySchema } from "@/lib/internal-norm/schemas/repeat-purchases";
import { getRepeatPurchaseSummary } from "@/services/admin/repeatPurchaseAnalytics";

/**
 * GET /v1/analytics/repeat-purchases
 * One-time-package repeat-purchase (reconversion) summary — all-time. Wraps the same
 * service the admin Repeat Purchases tab uses, so figures match by construction.
 * Aggregate counts only — no PII.
 */
export const GET = withNorm(
  {
    tier: "read",
    registryKey: "analytics.repeat-purchases",
    requiredPermission: "pageAnalytics.view",
    responseSchema: NormRepeatPurchaseSummarySchema,
    perEndpointPerMinute: 10,
  },
  async (ctx) => {
    const data = await getRepeatPurchaseSummary({});
    return ctx.ok(data);
  }
);
