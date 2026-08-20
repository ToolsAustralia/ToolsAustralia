import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import {
  brandPerformanceService,
  type BrandPerformanceBasis,
  type BrandPerformancePlatformScope,
} from "@/services/analytics/BrandPerformanceService";
import { isAdPlatform } from "@/services/analytics/adPlatformAccounts";
import { resolvePreviousCalendarMonthAest } from "@/utils/admin/resolveAestDateWindow";
import type { BrandLane } from "@/utils/metrics/brand-lane";

export const dynamic = "force-dynamic";
// On-read freshness may sync the trailing 1-2 days from the ad platform (time-budgeted), and a
// comparison window doubles the outcome aggregation. Same budget as the spend-by-url sibling.
export const maxDuration = 60;

const LANES: BrandLane[] = ["toolset", "toolbox"];
const BASES: BrandPerformanceBasis[] = ["landing-page", "built-prize", "platform"];

/**
 * GET /api/admin/analytics/brand-performance
 *   ?startDate=&endDate=
 *   &lane=toolset|toolbox
 *   &basis=landing-page|built-prize|platform
 *   &platform=meta|tiktok|all
 *   &compare=previous-calendar-month
 *
 * Ad spend and return per brand lane. Spend is always URL-keyed (the only key it can have);
 * `basis` selects where the outcome figures come from. See BrandPerformanceService for why
 * that split is forced rather than chosen.
 *
 * Unlike the `spend-by-url` sibling, `platform=all` IS offered — because for the two server
 * bases the revenue comes from our own ledger and is read once, so combining platforms only
 * combines spend and is safe. Under `basis=platform` the response sets
 * `meta.blendedPlatformRevenue` so the UI can flag the double-counting that sibling avoids by
 * refusing the option outright.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("facebookAds.view");
    if (guard instanceof NextResponse) return guard;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: "startDate and endDate are required (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    const lane = (searchParams.get("lane") ?? "toolset") as BrandLane;
    if (!LANES.includes(lane)) {
      return NextResponse.json(
        { success: false, error: "lane must be 'toolset' or 'toolbox'" },
        { status: 400 },
      );
    }

    const basis = (searchParams.get("basis") ?? "landing-page") as BrandPerformanceBasis;
    if (!BASES.includes(basis)) {
      return NextResponse.json(
        { success: false, error: "basis must be 'landing-page', 'built-prize' or 'platform'" },
        { status: 400 },
      );
    }

    const platformParam = searchParams.get("platform") ?? "all";
    if (platformParam !== "all" && !isAdPlatform(platformParam)) {
      return NextResponse.json(
        { success: false, error: "platform must be 'meta', 'tiktok' or 'all'" },
        { status: 400 },
      );
    }
    const platform = platformParam as BrandPerformancePlatformScope;

    // The comparison window is resolved SERVER-side so every caller compares against the same
    // definition of "last month" — a client passing its own dates would let two surfaces on the
    // same screen benchmark against different windows.
    const compareTo =
      searchParams.get("compare") === "previous-calendar-month"
        ? resolvePreviousCalendarMonthAest()
        : undefined;

    const result = await brandPerformanceService.getBrandPerformance({
      startDate,
      endDate,
      lane,
      basis,
      platform,
      compareTo,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("brand-performance GET:", e);
    return NextResponse.json(
      { success: false, error: "Failed to load brand performance" },
      { status: 500 },
    );
  }
}
