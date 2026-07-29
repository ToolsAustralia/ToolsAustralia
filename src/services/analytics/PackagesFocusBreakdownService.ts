import MetaAdInsightsDaily, { type IMetaAdInsightsDaily } from "@/models/MetaAdInsightsDaily";
import TikTokAdInsightsDaily from "@/models/TikTokAdInsightsDaily";
import AdDestination, { type IAdDestination } from "@/models/AdDestination";
import LandingPageMetricsDaily, { type ILandingPageMetricsDaily } from "@/models/LandingPageMetricsDaily";
import {
  derivePackagesFocusForDestination,
  type PackagesFocusBucket,
} from "@/utils/metrics/packages-focus";
import { ensureSpendByUrlFreshness } from "@/services/meta/spendByUrlFreshness";

export type AdsPlatform = "meta" | "tiktok";
export interface PackagesFocusTotals {
  spend: number; spendCents: number; revenue: number; revenueCents: number;
  roas: number; conversions: number; impressions: number; clicks: number;
}
export interface PackagesFocusAdNode {
  adId: string; adName?: string;
  adFormat: "video" | "static" | "carousel" | "unknown";
  totals: PackagesFocusTotals;
}
export interface PackagesFocusAdsetNode {
  adsetId: string; adsetName?: string; totals: PackagesFocusTotals; ads: PackagesFocusAdNode[];
}
export interface PackagesFocusCampaignNode {
  campaignId: string; campaignName?: string; totals: PackagesFocusTotals; adsets: PackagesFocusAdsetNode[];
}
export interface PackagesFocusBreakdownResult {
  platform: AdsPlatform;
  supported: boolean;                       // false only when the platform has no account configured
  reason?: "not-configured";
  meta: { startDate: string; endDate: string; currency: "AUD"; adAccountId: string };
  summary: {                                 // aggregate-backed: works for ANY range
    membership: PackagesFocusTotals;
    "one-time": PackagesFocusTotals;
    unclassified: PackagesFocusTotals;
    total: PackagesFocusTotals;
  };
  detail: {                                  // live-join-backed: ~60d (insights TTL)
    complete: boolean;                       // false when the requested range starts before availableSince
    availableSince: string | null;           // oldest date the account still has ANY per-ad insights for (TTL floor)
    buckets: {
      membership: PackagesFocusCampaignNode[];
      "one-time": PackagesFocusCampaignNode[];
      unclassified: PackagesFocusCampaignNode[];
    };
  };
}

function centsToAud(cents: number): number {
  return Math.round(cents) / 100;
}

interface CentsAcc {
  spendCents: number; revenueCents: number; conversions: number; impressions: number; clicks: number;
}
const emptyAcc = (): CentsAcc => ({ spendCents: 0, revenueCents: 0, conversions: 0, impressions: 0, clicks: 0 });

function addTo(acc: CentsAcc, row: { spendCents: number; revenueCents?: number | null; conversions?: number | null; impressions?: number; clicks?: number }) {
  acc.spendCents += row.spendCents;
  acc.revenueCents += row.revenueCents ?? 0;
  acc.conversions += row.conversions ?? 0;
  acc.impressions += row.impressions ?? 0;
  acc.clicks += row.clicks ?? 0;
}

function formatTotals(acc: CentsAcc): PackagesFocusTotals {
  const spend = centsToAud(acc.spendCents);
  const revenue = centsToAud(acc.revenueCents);
  return {
    spend, spendCents: acc.spendCents, revenue, revenueCents: acc.revenueCents,
    roas: spend > 0 ? revenue / spend : 0,
    conversions: acc.conversions, impressions: acc.impressions, clicks: acc.clicks,
  };
}

/**
 * membership vs one-time vs unclassified breakdown of one platform's ad spend/ROAS.
 *
 * summary — sums LandingPageMetricsDaily rows (permanent, survives the per-ad
 *   insights TTL): rows with a packagesFocus split contribute per-focus; rows
 *   without one (unknown:// placeholders + pre-feature rows) → unclassified.
 * detail — live <platform> insights × AdDestination join grouped
 *   focus → campaign → adset → ad; only covers dates the insights collection
 *   still holds (~60d prod TTL). availableSince is the account's true
 *   retained-data floor (an unbounded oldest-date lookup, independent of the
 *   requested range); complete is true iff the requested range starts at or
 *   after that floor — a range with zero in-range rows is still "complete"
 *   (with empty buckets) when the floor predates it.
 *
 * Both platforms take the same path (2026-07-29). TikTok used to short-circuit to
 * `supported:false` because there was no ad→landing-URL mapping for it; the Smart+ id
 * bridge in TikTokAdDestinationService supplies one, so the only remaining reason to
 * report unsupported is a platform with no ad account configured in this environment.
 *
 * A caveat worth keeping in mind when reading TikTok's numbers: every TikTok ad observed
 * so far points at a membership landing page, so its one-time bucket is legitimately $0 —
 * that is the campaign setup, not a classification failure.
 */
export class PackagesFocusBreakdownService {
  async getBreakdownFormatted(
    platform: AdsPlatform,
    adAccountId: string,
    startDate: string,
    endDate: string,
  ): Promise<PackagesFocusBreakdownResult> {
    const meta = { startDate, endDate, currency: "AUD" as const, adAccountId };
    const emptySummary = () => ({
      membership: formatTotals(emptyAcc()),
      "one-time": formatTotals(emptyAcc()),
      unclassified: formatTotals(emptyAcc()),
      total: formatTotals(emptyAcc()),
    });

    if (!adAccountId) {
      // No account configured for this platform — say so rather than rendering $0 totals
      // that read as "this platform spent nothing".
      return {
        platform, supported: false, reason: "not-configured",
        meta,
        summary: emptySummary(),
        detail: { complete: false, availableSince: null, buckets: { membership: [], "one-time": [], unclassified: [] } },
      };
    }

    // Near-real-time: refresh the trailing 1-2 days when stale (>5min), bounded by a hard
    // time budget — see spendByUrlFreshness. Both platforms since 2026-07-29: TikTok's
    // report API measures ~0.33s for a 2-day window (vs Meta's ~8.7s), so the earlier
    // "TikTok is too slow for on-read" reasoning was simply wrong.
    await ensureSpendByUrlFreshness(platform, adAccountId, startDate, endDate);

    const [summary, detail] = await Promise.all([
      this.buildSummary(platform, adAccountId, startDate, endDate),
      this.buildDetail(platform, adAccountId, startDate, endDate),
    ]);
    return { platform, supported: true, meta, summary, detail };
  }

  private async buildSummary(
    platform: "meta" | "tiktok",
    adAccountId: string,
    since: string,
    until: string,
  ) {
    // Platform-scoped: an unscoped read would sum two platforms' spend into one total
    // with no indication, and divide one platform's revenue by combined spend.
    const rows = (await LandingPageMetricsDaily.find({
      platform,
      adAccountId,
      date: { $gte: since, $lte: until },
    }).lean()) as unknown as ILandingPageMetricsDaily[];
    const acc = { membership: emptyAcc(), "one-time": emptyAcc(), unclassified: emptyAcc(), total: emptyAcc() };
    for (const row of rows) {
      addTo(acc.total, row);
      if (row.packagesFocus) {
        addTo(acc.membership, row.packagesFocus.membership);
        addTo(acc["one-time"], row.packagesFocus["one-time"]);
        // Guard: any residue between the row total and its split (should be 0 by
        // construction) counts as unclassified rather than silently vanishing.
        const splitSpend = row.packagesFocus.membership.spendCents + row.packagesFocus["one-time"].spendCents;
        if (row.spendCents - splitSpend > 0.5) {
          acc.unclassified.spendCents += row.spendCents - splitSpend;
        }
      } else {
        addTo(acc.unclassified, row);
      }
    }
    return {
      membership: formatTotals(acc.membership),
      "one-time": formatTotals(acc["one-time"]),
      unclassified: formatTotals(acc.unclassified),
      total: formatTotals(acc.total),
    };
  }

  private async buildDetail(
    platform: AdsPlatform,
    adAccountId: string,
    since: string,
    until: string,
  ) {
    type InsightRow = Pick<
      IMetaAdInsightsDaily,
      | "date"
      | "adId"
      | "adsetId"
      | "campaignId"
      | "campaignName"
      | "adsetName"
      | "adName"
      | "spendCents"
      | "impressions"
      | "clicks"
      | "conversions"
      | "revenueCents"
    >;
    // Both collections share these field names by construction (TikTokAdInsightsDaily was
    // modelled on MetaAdInsightsDaily precisely so the read side stays one code path).
    const InsightsModel = platform === "tiktok" ? TikTokAdInsightsDaily : MetaAdInsightsDaily;

    const insights = (await InsightsModel.find({
      adAccountId,
      date: { $gte: since, $lte: until },
    })
      .select({
        date: 1,
        adId: 1,
        adsetId: 1,
        campaignId: 1,
        campaignName: 1,
        adsetName: 1,
        adName: 1,
        spendCents: 1,
        impressions: 1,
        clicks: 1,
        conversions: 1,
        revenueCents: 1,
      })
      .lean()) as unknown as InsightRow[];

    // availableSince/complete describe the TTL floor of the retained-data
    // collection, not the range-filtered query above — a separate unbounded
    // lookup for the oldest retained date, so a zero-delivery day at the
    // start of `since` doesn't falsely report complete:false.
    const oldestDoc = (await InsightsModel.findOne({ adAccountId })
      .sort({ date: 1 })
      .select({ date: 1 })
      .lean()) as unknown as { date: string } | null;
    const availableSince = oldestDoc?.date ?? null;
    const complete = availableSince !== null && availableSince <= since;

    if (insights.length === 0) {
      return { complete, availableSince, buckets: { membership: [], "one-time": [], unclassified: [] } };
    }

    const adIds = [...new Set(insights.map((i) => i.adId))];
    // MUST filter by platform: ad ids are only unique WITHIN a platform, so an unscoped
    // read would attach another platform's landing URL to this platform's ad (2026-07-29).
    const dests = (await AdDestination.find({
      platform,
      adId: { $in: adIds },
    }).lean()) as unknown as IAdDestination[];
    const destByAd = new Map(dests.map((d) => [d.adId, d]));

    type AdAcc = { adName?: string; adFormat: PackagesFocusAdNode["adFormat"]; acc: CentsAcc };
    type AdsetAcc = { adsetName?: string; acc: CentsAcc; ads: Map<string, AdAcc> };
    type CampaignAcc = { campaignName?: string; acc: CentsAcc; adsets: Map<string, AdsetAcc> };
    const buckets: Record<PackagesFocusBucket, Map<string, CampaignAcc>> = {
      membership: new Map(), "one-time": new Map(), unclassified: new Map(),
    };

    for (const row of insights) {
      const dest = destByAd.get(row.adId);
      const bucket = derivePackagesFocusForDestination(dest);
      const campaignId = row.campaignId ?? "unknown-campaign";
      const adsetId = row.adsetId ?? "unknown-adset";

      const campaigns = buckets[bucket];
      const campaign = campaigns.get(campaignId) ?? { campaignName: undefined, acc: emptyAcc(), adsets: new Map() };
      campaign.campaignName = row.campaignName ?? campaign.campaignName;
      addTo(campaign.acc, row);

      const adset = campaign.adsets.get(adsetId) ?? { adsetName: undefined, acc: emptyAcc(), ads: new Map() };
      adset.adsetName = row.adsetName ?? adset.adsetName;
      addTo(adset.acc, row);

      const rawFormat = dest?.adFormat;
      const adFormat: PackagesFocusAdNode["adFormat"] =
        rawFormat === "video" || rawFormat === "static" || rawFormat === "carousel" ? rawFormat : "unknown";
      const ad = adset.ads.get(row.adId) ?? { adName: undefined, adFormat, acc: emptyAcc() };
      ad.adName = row.adName ?? ad.adName;
      addTo(ad.acc, row);

      adset.ads.set(row.adId, ad);
      campaign.adsets.set(adsetId, adset);
      campaigns.set(campaignId, campaign);
    }

    const toNodes = (campaigns: Map<string, CampaignAcc>): PackagesFocusCampaignNode[] =>
      [...campaigns.entries()]
        .map(([campaignId, c]) => ({
          campaignId,
          campaignName: c.campaignName,
          totals: formatTotals(c.acc),
          adsets: [...c.adsets.entries()]
            .map(([adsetId, s]) => ({
              adsetId,
              adsetName: s.adsetName,
              totals: formatTotals(s.acc),
              ads: [...s.ads.entries()]
                .map(([adId, a]) => ({ adId, adName: a.adName, adFormat: a.adFormat, totals: formatTotals(a.acc) }))
                .sort((a, b) => b.totals.spendCents - a.totals.spendCents),
            }))
            .sort((a, b) => b.totals.spendCents - a.totals.spendCents),
        }))
        .sort((a, b) => b.totals.spendCents - a.totals.spendCents);

    return {
      complete,
      availableSince,
      buckets: {
        membership: toNodes(buckets.membership),
        "one-time": toNodes(buckets["one-time"]),
        unclassified: toNodes(buckets.unclassified),
      },
    };
  }
}
