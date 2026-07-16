import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { getTikTokAdInsights } from "@/services/admin/tiktok/tiktokAdInsightsQuery";

const querySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * GET /api/admin/tiktok-ads/insights?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Per-TikTok-ad breakdown (adName + spend + TikTok-reported conversions/revenue + ROAS)
 * from TikTokAdInsightsDaily. The TikTok analogue of /api/admin/facebook-ads/insights.
 * Gated on the same paid-ads-analytics permission as the rest of the TikTok tab.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("facebookAds.view");
    if (guard instanceof NextResponse) return guard;

    const parsed = querySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid query", details: parsed.error.issues },
        { status: 400 },
      );
    }

    await connectDB();

    const data = await getTikTokAdInsights(parsed.data);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("❌ /api/admin/tiktok-ads/insights error", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
