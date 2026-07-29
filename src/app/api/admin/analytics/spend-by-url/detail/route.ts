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
 * GET /api/admin/analytics/spend-by-url/detail?canonicalUrl=&startDate=&endDate=&platform=
 * Per-ad breakdown for one or more canonical landing URLs (repeat canonicalUrl for batch).
 *
 * Single platform per request (default meta). Ad ids are only unique WITHIN a platform, so
 * a cross-platform per-ad view would be ambiguous by construction, not merely awkward.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("facebookAds.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const { searchParams } = new URL(request.url);
    const canonicalUrls = searchParams.getAll("canonicalUrl").map((u) => u.trim()).filter(Boolean);
    const uniqueCanonicalUrls = [...new Set(canonicalUrls)];
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

    if (uniqueCanonicalUrls.length === 0 || !startDate || !endDate) {
      return NextResponse.json(
        {
          success: false,
          error: "At least one canonicalUrl, startDate, and endDate are required",
        },
        { status: 400 }
      );
    }

    // Near-real-time: refresh the trailing 1-2 days from Meta when stale (>5min),
    // bounded by a hard time budget — see spendByUrlFreshness.
    if (platform === "meta") {
      await ensureSpendByUrlFreshness(adAccountId, startDate, endDate);
    }

    const result = await aggService.getSpendByUrlDetailFormatted(
      platform,
      adAccountId,
      uniqueCanonicalUrls,
      startDate,
      endDate
    );

    return NextResponse.json({ success: true, platform, ...result });
  } catch (e) {
    console.error("spend-by-url detail GET:", e);
    return NextResponse.json({ success: false, error: "Failed to load detail" }, { status: 500 });
  }
}
