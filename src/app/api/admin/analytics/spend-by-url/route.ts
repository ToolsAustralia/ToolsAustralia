import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { SpendByUrlAggregationService } from "@/services/analytics/SpendByUrlAggregationService";

export const dynamic = "force-dynamic";

const aggService = new SpendByUrlAggregationService();

function centsToAud(cents: number): number {
  return Math.round(cents) / 100;
}

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

    const rows = await aggService.getAggregatedSpendByUrl(adAccountId, startDate, endDate);

    const currency = "AUD";

    return NextResponse.json({
      success: true,
      meta: {
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
          canonicalUrl: r.canonicalUrl,
          spend,
          spendCents: r.spendCents,
          impressions: r.impressions,
          clicks: r.clicks,
          conversions: r.conversions,
          revenue: revenue,
          revenueCents: r.revenueCents,
          cpc,
          roas,
          adIds: r.adIds,
        };
      }),
    });
  } catch (e) {
    console.error("spend-by-url GET:", e);
    return NextResponse.json({ success: false, error: "Failed to load spend by URL" }, { status: 500 });
  }
}
