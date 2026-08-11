import TikTokAdInsightsDaily from "@/models/TikTokAdInsightsDaily";
import { isTikTokAdInsightsConfigured } from "./tiktokAdInsights";

/**
 * Granularity of the breakdown. Mirrors the Meta Health view's switcher, minus "account"
 * — an account-level row would just restate `totals`.
 */
export type TikTokInsightLevel = "campaign" | "adset" | "ad";

export const TIKTOK_INSIGHT_LEVELS: readonly TikTokInsightLevel[] = [
  "campaign",
  "adset",
  "ad",
] as const;

/**
 * One aggregated row (summed across the date range). Money in dollars.
 *
 * Field vocabulary matches `FacebookAdsInsightsService`'s row rather than a generic
 * `id`/`name` pair: the id/name fields ABOVE the requested level stay populated (an ad-set
 * row still names its campaign), and the ones BELOW it are null. So at `campaign` level
 * `adId`/`adName`/`adsetId`/`adsetName` are null, and at `ad` level everything is set.
 */
export interface TikTokAdInsightsRow {
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  /** Null above ad level. */
  adId: string | null;
  adName: string | null;
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
  /** The granularity these rows are grouped at. Uniform across the array. */
  level: TikTokInsightLevel;
  rows: TikTokAdInsightsRow[];
  totals: {
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
    roas: number;
  };
  dateRange: { startDate: string; endDate: string };
}

/**
 * Bucket for rows TikTok returned without an id at the requested level.
 *
 * `campaignId` / `adsetId` are optional on the model, so grouping by a missing key would
 * either collapse unrelated rows together or — worse — drop them. Dropping would make the
 * same date range report different totals at different levels, which is the kind of quiet
 * disagreement that destroys trust in a spend table. They get their own visible row instead.
 */
const UNATTRIBUTED_KEY = "__unattributed__";
const UNATTRIBUTED_LABEL = {
  campaign: "(no campaign reported)",
  adset: "(no ad set reported)",
  ad: "(no ad reported)",
} as const;

interface Agg {
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  adId: string | null;
  adName: string | null;
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenueCents: number;
}

const roas = (revenueCents: number, spendCents: number): number =>
  spendCents > 0 ? revenueCents / spendCents : 0;

/**
 * Aggregate TikTokAdInsightsDaily over [startDate, endDate] (inclusive, YYYY-MM-DD) at the
 * requested granularity, summing each group's days. Rows are sorted by spend desc. The
 * TikTok analogue of the Meta insights read (FacebookAdsInsightsService @ level). Read-only.
 *
 * `level` defaults to `"ad"` — the behaviour before the switcher existed, so every existing
 * caller (including the Norm mirror) keeps the exact shape it had.
 *
 * ROLLING UP IS SOUND HERE, not an approximation: each stored document is one ad-day, keyed
 * uniquely on `adAccountId + date + adId`, so summing every ad-day in a campaign counts each
 * spend figure exactly once. The conversions and revenue stay TikTok-reported at every level
 * (the platform's own attribution), matching what the ad-level table has always shown.
 */
export async function getTikTokAdInsights(range: {
  startDate: string;
  endDate: string;
  level?: TikTokInsightLevel;
}): Promise<TikTokAdInsightsResult> {
  const level: TikTokInsightLevel = range.level ?? "ad";
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
      "adId adName adsetId adsetName campaignId campaignName spendCents impressions clicks conversions revenueCents",
    )
    .lean();

  const byKey = new Map<string, Agg>();
  for (const d of docs) {
    // The grouping key is the id at the requested level. `adId` is required by the schema;
    // the other two are optional, so a missing one lands in the visible unattributed bucket
    // rather than silently merging with unrelated rows or vanishing from the totals.
    const rawKey =
      level === "campaign" ? d.campaignId : level === "adset" ? d.adsetId : d.adId;
    const key = rawKey && String(rawKey).trim() ? String(rawKey) : UNATTRIBUTED_KEY;

    const cur = byKey.get(key) ?? {
      campaignId: null,
      campaignName: null,
      adsetId: null,
      adsetName: null,
      adId: null,
      adName: null,
      spendCents: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      revenueCents: 0,
    };

    // Identity is populated only for the requested level and the levels ABOVE it. Below the
    // requested level a group spans many children, so naming one of them would be a lie —
    // an ad-set row must not claim to be a particular ad.
    if (d.campaignId) cur.campaignId = String(d.campaignId);
    if (d.campaignName) cur.campaignName = d.campaignName;
    if (level === "adset" || level === "ad") {
      if (d.adsetId) cur.adsetId = String(d.adsetId);
      if (d.adsetName) cur.adsetName = d.adsetName;
    }
    if (level === "ad") {
      cur.adId = d.adId;
      if (d.adName) cur.adName = d.adName;
    }

    cur.spendCents += d.spendCents ?? 0;
    cur.impressions += d.impressions ?? 0;
    cur.clicks += d.clicks ?? 0;
    cur.conversions += d.conversions ?? 0;
    cur.revenueCents += d.revenueCents ?? 0;
    byKey.set(key, cur);
  }

  const rows: TikTokAdInsightsRow[] = [...byKey.entries()]
    .map(([key, a]) => {
      // A group with no id at this level still needs a label, or the UI renders a blank row.
      const unattributed = key === UNATTRIBUTED_KEY;
      return {
        campaignId: a.campaignId,
        campaignName:
          level === "campaign" && unattributed ? UNATTRIBUTED_LABEL.campaign : a.campaignName,
        adsetId: a.adsetId,
        adsetName: level === "adset" && unattributed ? UNATTRIBUTED_LABEL.adset : a.adsetName,
        adId: a.adId,
        adName: level === "ad" && unattributed ? UNATTRIBUTED_LABEL.ad : a.adName,
        spend: a.spendCents / 100,
        impressions: a.impressions,
        clicks: a.clicks,
        conversions: a.conversions,
        revenue: a.revenueCents / 100,
        roas: roas(a.revenueCents, a.spendCents),
      };
    })
    .sort((x, y) => y.spend - x.spend);

  // Sum from the integer-cent aggregates (NOT the divided row dollars) so totals
  // carry no float noise into the JSON output. Because every document lands in exactly one
  // bucket at every level, these totals are identical whichever level was requested.
  const totCents = { spendCents: 0, impressions: 0, clicks: 0, conversions: 0, revenueCents: 0 };
  for (const a of byKey.values()) {
    totCents.spendCents += a.spendCents;
    totCents.impressions += a.impressions;
    totCents.clicks += a.clicks;
    totCents.conversions += a.conversions;
    totCents.revenueCents += a.revenueCents;
  }

  return {
    configured: isTikTokAdInsightsConfigured(),
    level,
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
