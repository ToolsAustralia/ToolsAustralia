import TikTokAdInsightsDaily from "@/models/TikTokAdInsightsDaily";
import { isTikTokAdInsightsConfigured } from "./tiktokAdInsights";

/** One aggregated per-ad row (summed across the date range). Money in dollars. */
export interface TikTokAdInsightsRow {
  adId: string;
  adName: string | null;
  campaignName: string | null;
  adsetName: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  /** TikTok-reported purchase value (dollars). */
  revenue: number;
  /** revenue / spend (0 when spend is 0). */
  roas: number;
}

export interface TikTokAdInsightsResult {
  /** false when TikTok Marketing-API creds are unset → UI shows "awaiting sync". */
  configured: boolean;
  rows: TikTokAdInsightsRow[];
  totals: Omit<TikTokAdInsightsRow, "adId" | "adName" | "campaignName" | "adsetName">;
  dateRange: { startDate: string; endDate: string };
}

interface AdAgg {
  adName: string | null;
  campaignName: string | null;
  adsetName: string | null;
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenueCents: number;
}

const roas = (revenueCents: number, spendCents: number): number =>
  spendCents > 0 ? revenueCents / spendCents : 0;

/**
 * Aggregate TikTokAdInsightsDaily per ad over [startDate, endDate] (inclusive, YYYY-MM-DD),
 * summing each ad's days. Rows are sorted by spend desc. The TikTok analogue of the Meta
 * ad-level insights read (FacebookAdsInsightsService @ level=ad). Read-only.
 */
export async function getTikTokAdInsights(range: {
  startDate: string;
  endDate: string;
}): Promise<TikTokAdInsightsResult> {
  const advertiserId = process.env.TIKTOK_ADVERTISER_ID?.trim();
  const filter: Record<string, unknown> = {
    date: { $gte: range.startDate, $lte: range.endDate },
  };
  if (advertiserId) filter.adAccountId = advertiserId;

  // Exclude `raw` (the full TikTok API row kept for field-name forensics) — the
  // aggregation below never reads it, and shipping it per doc is the repo's
  // unprojected-.find() footgun at 1000 ads × 60 days (panel F-023).
  const docs = await TikTokAdInsightsDaily.find(filter)
    .select(
      "adId adName campaignName adsetName spendCents impressions clicks conversions revenueCents",
    )
    .lean();

  const byAd = new Map<string, AdAgg>();
  for (const d of docs) {
    const cur = byAd.get(d.adId) ?? {
      adName: null,
      campaignName: null,
      adsetName: null,
      spendCents: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      revenueCents: 0,
    };
    // Keep the most recent non-empty label (rows already share the same ad).
    if (d.adName) cur.adName = d.adName;
    if (d.campaignName) cur.campaignName = d.campaignName;
    if (d.adsetName) cur.adsetName = d.adsetName;
    cur.spendCents += d.spendCents ?? 0;
    cur.impressions += d.impressions ?? 0;
    cur.clicks += d.clicks ?? 0;
    cur.conversions += d.conversions ?? 0;
    cur.revenueCents += d.revenueCents ?? 0;
    byAd.set(d.adId, cur);
  }

  const rows: TikTokAdInsightsRow[] = [...byAd.entries()]
    .map(([adId, a]) => ({
      adId,
      adName: a.adName,
      campaignName: a.campaignName,
      adsetName: a.adsetName,
      spend: a.spendCents / 100,
      impressions: a.impressions,
      clicks: a.clicks,
      conversions: a.conversions,
      revenue: a.revenueCents / 100,
      roas: roas(a.revenueCents, a.spendCents),
    }))
    .sort((x, y) => y.spend - x.spend);

  // Sum from the integer-cent aggregates (NOT the divided row dollars) so totals
  // carry no float noise into the JSON output.
  const totCents = { spendCents: 0, impressions: 0, clicks: 0, conversions: 0, revenueCents: 0 };
  for (const a of byAd.values()) {
    totCents.spendCents += a.spendCents;
    totCents.impressions += a.impressions;
    totCents.clicks += a.clicks;
    totCents.conversions += a.conversions;
    totCents.revenueCents += a.revenueCents;
  }

  return {
    configured: isTikTokAdInsightsConfigured(),
    rows,
    totals: {
      spend: totCents.spendCents / 100,
      impressions: totCents.impressions,
      clicks: totCents.clicks,
      conversions: totCents.conversions,
      revenue: totCents.revenueCents / 100,
      roas: roas(totCents.revenueCents, totCents.spendCents),
    },
    dateRange: { startDate: range.startDate, endDate: range.endDate },
  };
}
