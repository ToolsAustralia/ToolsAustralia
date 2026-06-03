import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { SpendByUrlAggregationService } from "@/services/analytics/SpendByUrlAggregationService";

export const dynamic = "force-dynamic";

const aggService = new SpendByUrlAggregationService();

/**
 * GET /api/admin/analytics/spend-by-url/detail?canonicalUrl=&startDate=&endDate=
 * Per-ad breakdown for one or more canonical landing URLs (repeat canonicalUrl for batch).
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
    const canonicalUrls = searchParams.getAll("canonicalUrl").map((u) => u.trim()).filter(Boolean);
    const uniqueCanonicalUrls = [...new Set(canonicalUrls)];
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (uniqueCanonicalUrls.length === 0 || !startDate || !endDate) {
      return NextResponse.json(
        {
          success: false,
          error: "At least one canonicalUrl, startDate, and endDate are required",
        },
        { status: 400 }
      );
    }

    const result = await aggService.getSpendByUrlDetailFormatted(
      adAccountId,
      uniqueCanonicalUrls,
      startDate,
      endDate
    );

    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("spend-by-url detail GET:", e);
    return NextResponse.json({ success: false, error: "Failed to load detail" }, { status: 500 });
  }
}
