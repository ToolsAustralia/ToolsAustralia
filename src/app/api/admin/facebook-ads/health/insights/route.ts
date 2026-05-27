import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { aggregateInsights } from "@/services/facebook-ads-health/insightsAggregator";
import { computeVerdict } from "@/services/facebook-ads-health/verdictEngine";
import { getOrInitSettings } from "@/services/facebook-ads-health/settingsService";
import { loadActiveSnoozes } from "@/services/facebook-ads-health/snoozeService";
import { parseISO } from "date-fns";

// Health view mirrors the legacy Ads view's level switcher (campaign/adset/ad).
// Verdict semantics are most meaningful at adset level, but campaign and ad
// levels are supported so the team can switch granularity without leaving the
// Health view. "Account" level is intentionally NOT supported — verdicts don't
// make sense for a single aggregated row.
const querySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  level: z.enum(["campaign", "adset", "ad"]).default("adset"),
  // ALL row-level filters (verdict, learningStatus, liveOnly, minSpend, search, campaign)
  // are applied client-side. They are intentionally absent from this schema — keeping them
  // server-side defeats TanStack cache hits AND would shrink the client's campaign list to
  // the currently-filtered subset, breaking a future multiselect dropdown.
});

export async function GET(request: NextRequest) {
  // requirePermission returns { session: Session } or a NextResponse — destructure.
  const guard = await requirePermission("facebookAds.view");
  if (guard instanceof NextResponse) return guard;
  const { session } = guard;

  await connectDB();
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid query", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const q = parsed.data;
  const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID ?? "";
  const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN ?? "";
  if (!adAccountId) {
    return NextResponse.json(
      { success: false, error: "FACEBOOK_AD_ACCOUNT_ID not configured" },
      { status: 500 },
    );
  }
  if (!accessToken) {
    return NextResponse.json(
      { success: false, error: "FACEBOOK_MARKETING_ACCESS_TOKEN not configured" },
      { status: 500 },
    );
  }

  const settings = await getOrInitSettings();
  const rows = await aggregateInsights({
    adAccountId,
    startDate: parseISO(q.startDate),
    endDate: parseISO(q.endDate),
    level: q.level,
    accessToken,
  });

  // All row-level filtering is now client-side. The route returns the full set
  // so the client can compute a complete campaign list for any future multiselect.
  const enriched = rows.map((row) => {
    const v = computeVerdict(row, settings);
    return { row, v };
  });

  const userId = session.user?.id ?? "";
  const snoozes = userId
    ? await loadActiveSnoozes(userId, enriched.map((e) => e.row.id))
    : new Map<string, Date>();

  // alertCount tallies the full (campaign-filtered) set before any client-side filter is applied.
  // The client recomputes a filtered alertCount from displayedRows so the banner reflects what's visible.
  let investigateCount = 0;
  let cutCount = 0;
  const out = enriched.map(({ row, v }) => {
    if (v.verdict === "investigate") investigateCount++;
    if (v.verdict === "cut") cutCount++;
    return {
      id: row.id,
      name: row.name,
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      adsetId: row.adsetId,
      adsetName: row.adsetName,
      learningStatus: row.learningStatusBucket,
      metaRawStatus: row.learningStatusRaw,
      effectiveStatus: row.effectiveStatus,
      daily: row.daily.map((d) => ({
        date: d.date,
        spendCents: d.spendCents,
        conversions: d.conversions,
        revenueCents: d.revenueCents,
        linkClicks: d.linkClicks,
        impressions: d.impressions,
        linkCtr: d.impressions > 0 ? (d.linkClicks / d.impressions) * 100 : 0,
        costPerLinkClick: d.linkClicks > 0 ? d.spendCents / d.linkClicks : 0,
        roas: d.spendCents > 0 ? d.revenueCents / d.spendCents : 0,
      })),
      window: row.window,
      last7d: {
        conversions: row.last7d.conversions,
        roas: row.last7d.spendCents > 0 ? row.last7d.revenueCents / row.last7d.spendCents : 0,
        prev7dRoas: row.last7d.prev7dRoas,
      },
      lastSignificantEdit: row.lastSignificantEdit,
      lastBudgetChangePct: row.lastBudgetChangePct,
      daysAtZero: row.daysAtZeroInWindow,
      verdict: v.verdict,
      verdictReasons: v.reasons,
      actionText: v.actionText,
      metaAdsManagerUrl: `https://business.facebook.com/adsmanager/manage/adsets?act=${adAccountId.replace(/^act_/, "")}&selected_adset_ids=${row.adsetId ?? row.id}`,
      snoozedUntil: snoozes.get(row.id) ?? null,
    };
  });

  return NextResponse.json({
    success: true,
    rows: out,
    alertCount: { investigate: investigateCount, cut: cutCount },
  });
}
