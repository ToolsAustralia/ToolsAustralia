import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMetricsDebugSchema } from "@/lib/internal-norm/schemas/metrics";
import { getMetricsDebugSnapshot } from "@/services/metrics/MetricsDebugService";

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(7),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "metrics.debug",
    requiredPermission: "overview.view",
    responseSchema: NormMetricsDebugSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }
    const snapshot = await getMetricsDebugSnapshot(parsed.data.days);

    return ctx.ok({
      dateRange: {
        start: snapshot.dateRange.start.toISOString(),
        end: snapshot.dateRange.end.toISOString(),
        days: snapshot.dateRange.days,
      },
      paymentEvents: {
        count: snapshot.paymentEvents.count,
        totalRevenue: snapshot.paymentEvents.totalRevenue,
        sample: snapshot.paymentEvents.sample.map((e) => ({
          timestamp: e.timestamp.toISOString(),
          price: e.price ?? null,
          packageType: e.packageType ?? null,
        })),
      },
      facebookAds: snapshot.facebookAds,
      note: snapshot.note,
    });
  }
);
