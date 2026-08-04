import { z } from "zod";
import { CHANNEL_KEYS } from "@/config/attribution-channels";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormPromoAnalyticsChannelDetailSchema } from "@/lib/internal-norm/schemas/promo-analytics";
import PromoAnalyticsService, {
  resolvePromoAnalyticsRange,
} from "@/services/promo-analytics/PromoAnalyticsService";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const QuerySchema = z.object({
  channel: z.enum(CHANNEL_KEYS),
  startDate: z.string().regex(YMD).optional(),
  endDate: z.string().regex(YMD).optional(),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "promo-analytics.channel-detail",
    requiredPermission: "promos.view",
    responseSchema: NormPromoAnalyticsChannelDetailSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }
    const hasCustom = !!(parsed.data.startDate && parsed.data.endDate);
    let range;
    try {
      range = resolvePromoAnalyticsRange({
        dateRange: hasCustom ? "custom" : "today",
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
      });
    } catch (e) {
      return ctx.error(400, "bad_query", (e as Error).message);
    }
    const data = await PromoAnalyticsService.getChannelDetailMetrics(
      parsed.data.channel,
      range.start,
      range.end,
    );
    return ctx.ok(data);
  },
);
