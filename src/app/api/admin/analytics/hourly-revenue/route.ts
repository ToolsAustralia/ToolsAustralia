import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { PaymentEventRepository } from "@/repositories/PaymentEventRepository";
import { createAESTDateAsUTC } from "@/utils/common/timezone";
import type { AttributedPlatformKey } from "@/models/DashboardStatsDailySnapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/analytics/hourly-revenue
 *
 * Server-side hour-of-day (0-23, Australia/Sydney) revenue + conversions for the
 * selected date range, from payment-attributed PaymentEvents (acquisition only —
 * renewals + refunds excluded). `platform` selects the series: a single ad
 * platform, "klaviyo" (email + sms merged), or "all" (every channel summed).
 * Delegates to PaymentEventRepository.aggregateRevenueByHourAndPlatform (SHARED-1).
 *
 * Intended for bounded UI date-picker ranges — the underlying refund-exclusion
 * `$lookup` is per-row, so very large spans are a perf hot-spot (a preloaded
 * refunded-pid Set would be the optimization, keeping all-time semantics).
 */
const querySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  platform: z.enum(["meta", "tiktok", "snapchat", "klaviyo", "all"]).optional().default("all"),
});

// Maps the `platform` query value → the convertingPlatform keys to sum (merge rule, stated once).
const PLATFORM_GROUPS: Record<string, AttributedPlatformKey[]> = {
  meta: ["meta"],
  tiktok: ["tiktok"],
  snapchat: ["snapchat"],
  klaviyo: ["klaviyo_email", "klaviyo_sms"],
  all: ["meta", "tiktok", "snapchat", "klaviyo_email", "klaviyo_sms", "google", "direct", "other"],
};

export async function GET(request: NextRequest) {
  const guard = await requirePermission("facebookAds.view");
  if (guard instanceof NextResponse) return guard;

  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid query parameters",
        details: e instanceof z.ZodError ? e.issues : "Validation failed",
      },
      { status: 400 }
    );
  }

  await connectDB();

  // AEST day bounds: start = midnight of startDate; end = EXCLUSIVE midnight of the day AFTER endDate.
  const [sy, sm, sd] = q.startDate.split("-").map(Number);
  const [ey, em, ed] = q.endDate.split("-").map(Number);
  const startUTC = createAESTDateAsUTC(sy, sm, sd, 0, 0);
  // Roll the calendar day over via a UTC anchor — createAESTDateAsUTC builds from a
  // string and would reject a day-overflow like "2099-03-32".
  const endAnchor = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));
  endAnchor.setUTCDate(endAnchor.getUTCDate() + 1);
  const endUTC = createAESTDateAsUTC(
    endAnchor.getUTCFullYear(),
    endAnchor.getUTCMonth() + 1,
    endAnchor.getUTCDate(),
    0,
    0
  );

  if (endUTC.getTime() <= startUTC.getTime()) {
    return NextResponse.json(
      { success: false, error: "endDate must be on or after startDate" },
      { status: 400 }
    );
  }

  try {
    const byPlatform = await new PaymentEventRepository().aggregateRevenueByHourAndPlatform(startUTC, endUTC);
    const keys = PLATFORM_GROUPS[q.platform];

    // Merge the requested platform group into one 24-bucket series.
    const hourly = Array.from({ length: 24 }, (_, hour) => {
      let revenue = 0;
      let conversions = 0;
      for (const k of keys) {
        revenue += byPlatform[k][hour].revenue;
        conversions += byPlatform[k][hour].conversions;
      }
      return { hour, revenue, conversions };
    });

    const totalRevenue = hourly.reduce((s, h) => s + h.revenue, 0);
    const totalConversions = hourly.reduce((s, h) => s + h.conversions, 0);

    return NextResponse.json({
      success: true,
      data: {
        hourly,
        totalRevenue,
        totalConversions,
        platform: q.platform,
        dateRange: { start: q.startDate, end: q.endDate },
      },
    });
  } catch (e) {
    console.error("❌ [hourly-revenue] aggregation failed:", e);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to aggregate hourly revenue",
        details: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
