import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { SpendByUrlAggregationService } from "@/services/analytics/SpendByUrlAggregationService";
import { ensureSpendByUrlFreshness } from "@/services/meta/spendByUrlFreshness";
import {
  adAccountEnvVar,
  isAdPlatform,
  resolveAdAccountId,
} from "@/services/analytics/adPlatformAccounts";

export const dynamic = "force-dynamic";
// On-read freshness may sync the trailing 1-2 days from Meta (time-budgeted).
export const maxDuration = 60;

const aggService = new SpendByUrlAggregationService();

/**
 * GET /api/admin/analytics/spend-by-url?startDate=&endDate=&platform=meta|tiktok
 * Aggregated spend and delivery metrics per canonical landing URL (from synced data).
 *
 * ONE platform per request, defaulting to meta for back-compat. There is deliberately no
 * "all" option: spend across platforms is additive, but platform-REPORTED revenue is each
 * platform's own attribution and the same purchase can be claimed by both — a blended row
 * would inflate revenue and ROAS with no way for the reader to see it. Callers that want a
 * company-wide view request each platform and combine explicitly (see PrizePerformanceCard).
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("facebookAds.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const platform = searchParams.get("platform") ?? "meta";

    if (!isAdPlatform(platform)) {
      return NextResponse.json(
        { success: false, error: "platform must be 'meta' or 'tiktok'" },
        { status: 400 }
      );
    }

    const adAccountId = resolveAdAccountId(platform);
    if (!adAccountId) {
      return NextResponse.json(
        { success: false, error: `${adAccountEnvVar(platform)} not configured` },
        { status: 500 }
      );
    }

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: "startDate and endDate are required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // Near-real-time: refresh the trailing 1-2 days from Meta when stale (>5min),
    // bounded by a hard time budget — see spendByUrlFreshness. Meta-only: TikTok's
    // rollup is rebuilt by its nightly cron.
    if (platform === "meta") {
      await ensureSpendByUrlFreshness(adAccountId, startDate, endDate);
    }

    const result = await aggService.getSpendByUrlListFormatted(
      platform,
      adAccountId,
      startDate,
      endDate
    );

    return NextResponse.json({ success: true, platform, ...result });
  } catch (e) {
    console.error("spend-by-url GET:", e);
    return NextResponse.json({ success: false, error: "Failed to load spend by URL" }, { status: 500 });
  }
}
