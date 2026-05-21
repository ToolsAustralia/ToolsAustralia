import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormFacebookAdsPurchaseAuditSchema } from "@/lib/internal-norm/schemas/facebook-ads";
import { PurchaseAuditService } from "@/services/facebook-ads/PurchaseAuditService";

const QuerySchema = z.object({
  range: z.enum(["today", "7d", "30d"]).default("today"),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "facebook-ads.purchase-audit",
    requiredPermission: "facebookAds.view",
    responseSchema: NormFacebookAdsPurchaseAuditSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    const result = await new PurchaseAuditService().audit(parsed.data.range);
    return ctx.ok(result);
  },
);
