import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { getTikTokAdInsights } from "@/services/admin/tiktok/tiktokAdInsightsQuery";
import { getTikTokSyncHealth } from "@/services/admin/tiktok/tiktokSyncStatus";

const querySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Defaults to "ad" — the behaviour before the switcher existed, so an existing caller that
  // omits it (including the Norm mirror) gets exactly the response it always got.
  level: z.enum(["campaign", "adset", "ad"]).default("ad"),
});

/**
 * GET /api/admin/tiktok-ads/insights?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&level=campaign|adset|ad
 * TikTok spend breakdown at the requested granularity (spend + TikTok-reported
 * conversions/revenue + ROAS) from TikTokAdInsightsDaily, plus `syncHealth` (last cron
 * outcome + last row write) so the UI can distinguish "sync failing" from "genuinely no
 * spend" (panel F-002). The TikTok analogue of /api/admin/facebook-ads/insights. Gated on
 * the same paid-ads-analytics permission as the rest of the TikTok tab.
 *
 * NOTE: syncHealth is composed here at the route. `getTikTokAdInsights`'s row shape DID
 * change when the level switcher landed (`adId` is now nullable and `campaignId`/`adsetId`/
 * `level` were added), so the Norm mirror's responseSchema was updated in the same change —
 * a schema/output mismatch there is a runtime 500 that `tsc` cannot see.
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

    const [data, syncHealth] = await Promise.all([
      // Mapped field-by-field rather than spread, so a rename of a Zod key becomes a compile
      // error instead of a silently-defaulted parameter.
      getTikTokAdInsights({
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        level: parsed.data.level,
      }),
      getTikTokSyncHealth(),
    ]);
    return NextResponse.json({ success: true, data: { ...data, syncHealth } });
  } catch (e) {
    console.error("❌ /api/admin/tiktok-ads/insights error", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
