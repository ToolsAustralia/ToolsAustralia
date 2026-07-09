import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";
import { requirePermission } from "@/lib/api-auth-permissions";
import { getRepeatPurchaseSummary } from "@/services/admin/repeatPurchaseAnalytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AEST = "Australia/Sydney";
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const querySchema = z.object({
  startDate: z.string().regex(YMD).optional(),
  endDate: z.string().regex(YMD).optional(),
});

/**
 * GET /api/admin/analytics/repeat-purchases
 * Summary metrics for one-time-package repeat buyers (reconversion). Optional
 * ?startDate&endDate (AEST-inclusive) filters the cohort by first-purchase date.
 */
export async function GET(request: NextRequest) {
  const guard = await requirePermission("pageAnalytics.view");
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
    const startDate = q.startDate ? fromZonedTime(`${q.startDate}T00:00:00`, AEST) : undefined;
    // endDate is inclusive; convert to start of the next AEST day for the exclusive upper bound.
    const endDate = q.endDate ? addDays(fromZonedTime(`${q.endDate}T00:00:00`, AEST), 1) : undefined;
    const data = await getRepeatPurchaseSummary({ startDate, endDate });
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    console.error("❌ [repeat-purchases] summary failed:", e);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to compute repeat-purchase analytics",
        details: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
