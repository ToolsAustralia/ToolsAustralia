import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { SpendByUrlAggregationService } from "@/services/analytics/SpendByUrlAggregationService";

export const dynamic = "force-dynamic";

const aggService = new SpendByUrlAggregationService();

function centsToAud(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * GET /api/admin/analytics/spend-by-url/detail?canonicalUrl=&startDate=&endDate=
 * Per-ad breakdown for one canonical landing URL.
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
    if (!adAccountId) {
      return NextResponse.json(
        { success: false, error: "FACEBOOK_AD_ACCOUNT_ID not configured" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const canonicalUrl = searchParams.get("canonicalUrl");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!canonicalUrl || !startDate || !endDate) {
      return NextResponse.json(
        {
          success: false,
          error: "canonicalUrl, startDate, and endDate are required",
        },
        { status: 400 }
      );
    }

    const rows = await aggService.getSpendByUrlDetail(adAccountId, canonicalUrl, startDate, endDate);

    const currency = "AUD";

    return NextResponse.json({
      success: true,
      meta: {
        canonicalUrl,
        startDate,
        endDate,
        currency,
        adAccountId,
      },
      rows: rows.map((r) => {
        const spend = centsToAud(r.spendCents);
        const revenue = centsToAud(r.revenueCents);
        const cpc = r.clicks > 0 ? spend / r.clicks : 0;
        const roas = spend > 0 ? revenue / spend : 0;
        return {
          adId: r.adId,
          adName: r.adName,
          spend,
          spendCents: r.spendCents,
          impressions: r.impressions,
          clicks: r.clicks,
          conversions: r.conversions,
          revenue,
          revenueCents: r.revenueCents,
          cpc,
          roas,
          adFormat: r.adFormat,
        };
      }),
    });
  } catch (e) {
    console.error("spend-by-url detail GET:", e);
    return NextResponse.json({ success: false, error: "Failed to load detail" }, { status: 500 });
  }
}
