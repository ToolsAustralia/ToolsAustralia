import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { PackagesFocusBreakdownService } from "@/services/analytics/PackagesFocusBreakdownService";
import { isAdPlatform, resolveAdAccountId } from "@/services/analytics/adPlatformAccounts";

export const dynamic = "force-dynamic";
// The service's on-read freshness may sync the trailing 1-2 days from Meta
// (time-budgeted; see spendByUrlFreshness).
export const maxDuration = 60;

const breakdownService = new PackagesFocusBreakdownService();

/**
 * GET /api/admin/analytics/packages-focus?startDate=&endDate=&platform=meta|tiktok
 * Membership vs one-time landing-URL split of ad spend/ROAS: summary (materialized,
 * any range) + campaign→adset→ad detail (live insights join, ~60d).
 *
 * Both platforms are supported since 2026-07-29. The account id is resolved PER PLATFORM
 * (see adPlatformAccounts) — passing Meta's account id for a TikTok query would match no
 * rows and render a confident $0.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("facebookAds.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const platformParam = searchParams.get("platform") ?? "meta";

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: "startDate and endDate are required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }
    if (!isAdPlatform(platformParam)) {
      return NextResponse.json(
        { success: false, error: "platform must be 'meta' or 'tiktok'" },
        { status: 400 }
      );
    }

    // An unconfigured platform is not a 500 — the service returns supported:false /
    // "not-configured", which the UI renders as "not connected" rather than "$0 spent".
    const adAccountId = resolveAdAccountId(platformParam);

    const result = await breakdownService.getBreakdownFormatted(
      platformParam,
      adAccountId ?? "",
      startDate,
      endDate
    );

    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("packages-focus GET:", e);
    return NextResponse.json({ success: false, error: "Failed to load packages-focus breakdown" }, { status: 500 });
  }
}
