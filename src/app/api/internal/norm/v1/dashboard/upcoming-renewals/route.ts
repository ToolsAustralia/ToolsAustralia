import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormUpcomingRenewalsSchema } from "@/lib/internal-norm/schemas/dashboard";
import {
  getUpcomingRenewals,
  UPCOMING_RENEWALS_VALID_RANGES,
  type UpcomingRenewalsRange,
} from "@/services/admin/dashboardSlices";

const QuerySchema = z.object({
  range: z.coerce.number().int().default(7),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "dashboard.upcoming-renewals",
    requiredPermission: "overview.view",
    responseSchema: NormUpcomingRenewalsSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);

    if (!UPCOMING_RENEWALS_VALID_RANGES.includes(parsed.data.range as UpcomingRenewalsRange)) {
      return ctx.error(400, "bad_query", "Invalid range", {
        validValues: UPCOMING_RENEWALS_VALID_RANGES,
      });
    }

    const data = await getUpcomingRenewals({
      range: parsed.data.range as UpcomingRenewalsRange,
      page: parsed.data.page,
      limit: parsed.data.limit,
    });

    // PII-safe projection: drop customerName / customerEmail / amountFormatted (display-only);
    // keep opaque ids + numeric amount.
    return ctx.ok({
      renewals: data.renewals.map((r) => ({
        userId: r.userId,
        subscriptionId: r.subscriptionId,
        customerId: r.customerId,
        renewalDate: r.renewalDate,
        renewalDateFormatted: r.renewalDateFormatted,
        amountCents: r.amountCents,
      })),
      total: data.total,
      page: data.page,
      limit: data.limit,
      totalRevenue: data.totalRevenue,
    });
  },
);
