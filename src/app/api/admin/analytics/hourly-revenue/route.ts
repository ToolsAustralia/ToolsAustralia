import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth-permissions";
import { getHourlyRevenueByPlatform } from "@/services/admin/hourlyRevenueByPlatform";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/analytics/hourly-revenue
 *
 * Server-side hour-of-day (0-23, Australia/Sydney) revenue + conversions + ad
 * spend for the selected date range. Orchestration lives in the shared service
 * `getHourlyRevenueByPlatform` (also used by the Norm read route); this handler
 * just authorizes, validates, and shapes the admin response.
 */
const querySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  platform: z.enum(["meta", "tiktok", "snapchat", "klaviyo", "ad-channels", "all"]).optional().default("all"),
});

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

  try {
    const data = await getHourlyRevenueByPlatform(q);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e instanceof Error && e.message === "endDate must be on or after startDate") {
      return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    }
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
