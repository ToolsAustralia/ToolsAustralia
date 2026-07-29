import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { SpendByUrlAggregationService } from "@/services/analytics/SpendByUrlAggregationService";
import { ensureSpendByUrlFreshness } from "@/services/meta/spendByUrlFreshness";

export const dynamic = "force-dynamic";
// On-read freshness may sync the trailing 1-2 days from Meta (time-budgeted).
export const maxDuration = 60;

const aggService = new SpendByUrlAggregationService();

/**
 * GET /api/admin/analytics/spend-by-url
 * Aggregated spend and delivery metrics per canonical landing URL (from synced data).
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("facebookAds.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
    if (!adAccountId) {
      return NextResponse.json(
        { success: false, error: "FACEBOOK_AD_ACCOUNT_ID not configured" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: "startDate and endDate are required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // Near-real-time: refresh the trailing 1-2 days from Meta when stale (>5min),
    // bounded by a hard time budget — see spendByUrlFreshness.
    await ensureSpendByUrlFreshness(adAccountId, startDate, endDate);

    // Meta-only today; W7 adds a ?platform= param. Passing the literal keeps this
    // route's behaviour identical across the platform-scoping refactor.
    const result = await aggService.getSpendByUrlListFormatted(
      "meta",
      adAccountId,
      startDate,
      endDate
    );

    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("spend-by-url GET:", e);
    return NextResponse.json({ success: false, error: "Failed to load spend by URL" }, { status: 500 });
  }
}
