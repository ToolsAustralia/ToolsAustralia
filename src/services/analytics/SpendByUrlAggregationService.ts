import MetaAdInsightsDaily from "@/models/MetaAdInsightsDaily";
import MetaAdDestination from "@/models/MetaAdDestination";
import LandingPageMetricsDaily from "@/models/LandingPageMetricsDaily";

function enumerateDatesInclusive(since: string, until: string): string[] {
  const out: string[] = [];
  const a = new Date(since + "T00:00:00.000Z");
  const b = new Date(until + "T00:00:00.000Z");
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return out;
  for (let d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export interface RecomputeResult {
  datesProcessed: number;
  rowsWritten: number;
}

/**
 * Rebuilds LandingPageMetricsDaily from MetaAdInsightsDaily + MetaAdDestination for a date range.
 */
export class SpendByUrlAggregationService {
  async recomputeForDateRange(
    adAccountId: string,
    since: string,
    until: string,
    options?: { onProgress?: (message: string) => void }
  ): Promise<RecomputeResult> {
    const log = options?.onProgress;
    const dates = enumerateDatesInclusive(since, until);
    const totalDates = dates.length;
    let rowsWritten = 0;

    for (let di = 0; di < dates.length; di++) {
      const date = dates[di];
      const logThis =
        totalDates <= 31 ||
        di === 0 ||
        di === dates.length - 1 ||
        (di + 1) % 10 === 0;
      if (logThis) {
        log?.(`[aggregate] Day ${di + 1}/${totalDates} (${date})…`);
      }
      const insights = await MetaAdInsightsDaily.find({ adAccountId, date }).lean();
      if (insights.length === 0) {
        await LandingPageMetricsDaily.deleteMany({ adAccountId, date });
        continue;
      }

      const adIds = [...new Set(insights.map((i) => i.adId))];
      const dests = await MetaAdDestination.find({ adId: { $in: adIds } }).lean();
      const destByAd = new Map(dests.map((d) => [d.adId, d]));

      const agg = new Map<
        string,
        {
          spendCents: number;
          impressions: number;
          clicks: number;
          conversions: number;
          revenueCents: number;
          adIds: Set<string>;
        }
      >();

      for (const row of insights) {
        const dest = destByAd.get(row.adId);
        const canonicalUrl =
          dest?.canonicalUrl ?? `unknown://meta-ad/${row.adId}`;

        const cur =
          agg.get(canonicalUrl) ?? {
            spendCents: 0,
            impressions: 0,
            clicks: 0,
            conversions: 0,
            revenueCents: 0,
            adIds: new Set<string>(),
          };

        cur.spendCents += row.spendCents;
        cur.impressions += row.impressions;
        cur.clicks += row.clicks;
        cur.conversions += row.conversions ?? 0;
        cur.revenueCents += row.revenueCents ?? 0;
        cur.adIds.add(row.adId);
        agg.set(canonicalUrl, cur);
      }

      await LandingPageMetricsDaily.deleteMany({ adAccountId, date });

      const computedAt = new Date();
      const docs = [...agg.entries()].map(([canonicalUrl, v]) => ({
        adAccountId,
        date,
        canonicalUrl,
        spendCents: v.spendCents,
        impressions: v.impressions,
        clicks: v.clicks,
        conversions: v.conversions,
        revenueCents: v.revenueCents,
        adIds: [...v.adIds],
        computedAt,
      }));

      if (docs.length > 0) {
        await LandingPageMetricsDaily.insertMany(docs, { ordered: false });
        rowsWritten += docs.length;
      }
    }

    log?.(`[aggregate] Finished ${totalDates} calendar days, ${rowsWritten} URL×day rows written.`);
    return { datesProcessed: dates.length, rowsWritten };
  }

  /**
   * Sum materialized daily rows per canonical URL for a date range (dashboard table).
   */
  async getAggregatedSpendByUrl(
    adAccountId: string,
    since: string,
    until: string
  ): Promise<
    Array<{
      canonicalUrl: string;
      spendCents: number;
      impressions: number;
      clicks: number;
      conversions: number;
      revenueCents: number;
      adIds: string[];
    }>
  > {
    const daily = await LandingPageMetricsDaily.find({
      adAccountId,
      date: { $gte: since, $lte: until },
    }).lean();

    const map = new Map<
      string,
      {
        spendCents: number;
        impressions: number;
        clicks: number;
        conversions: number;
        revenueCents: number;
        adIds: Set<string>;
      }
    >();

    for (const row of daily) {
      const cur = map.get(row.canonicalUrl) ?? {
        spendCents: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenueCents: 0,
        adIds: new Set<string>(),
      };
      cur.spendCents += row.spendCents;
      cur.impressions += row.impressions;
      cur.clicks += row.clicks;
      cur.conversions += row.conversions ?? 0;
      cur.revenueCents += row.revenueCents ?? 0;
      for (const id of row.adIds ?? []) {
        cur.adIds.add(id);
      }
      map.set(row.canonicalUrl, cur);
    }

    return [...map.entries()]
      .map(([canonicalUrl, v]) => ({
        canonicalUrl,
        spendCents: v.spendCents,
        impressions: v.impressions,
        clicks: v.clicks,
        conversions: v.conversions,
        revenueCents: v.revenueCents,
        adIds: [...v.adIds],
      }))
      .sort((a, b) => b.spendCents - a.spendCents);
  }

  /**
   * Per-ad totals for one canonical URL (drill-down).
   */
  /**
   * Placeholder when no website URL was resolved; embeds the Meta ad id.
   * @see MetaAdDestinationService — if Graph API errors on the ad, no destination doc exists,
   * but aggregation still buckets spend under this string, so drill-down must not rely on MetaAdDestination alone.
   */
  private static readonly UNKNOWN_META_AD_RE = /^unknown:\/\/meta-ad\/(\d+)$/;

  async getSpendByUrlDetail(
    adAccountId: string,
    canonicalUrl: string,
    since: string,
    until: string
  ): Promise<
    Array<{
      adId: string;
      adName?: string;
      spendCents: number;
      impressions: number;
      clicks: number;
      conversions: number;
      revenueCents: number;
      adFormat: "video" | "static" | "carousel" | "unknown";
    }>
  > {
    const dests = await MetaAdDestination.find({ adAccountId, canonicalUrl }).lean();
    const destByAd = new Map(dests.map((d) => [d.adId, d]));
    let adIds = dests.map((d) => d.adId);

    if (adIds.length === 0) {
      const parsed = canonicalUrl.match(SpendByUrlAggregationService.UNKNOWN_META_AD_RE);
      if (parsed) {
        adIds = [parsed[1]];
      } else {
        const fromDistinct = await LandingPageMetricsDaily.distinct("adIds", {
          adAccountId,
          canonicalUrl,
          date: { $gte: since, $lte: until },
        });
        adIds = [...new Set((fromDistinct as string[]).filter(Boolean))];
      }
    }

    if (adIds.length === 0) {
      return [];
    }

    const rows = await MetaAdInsightsDaily.find({
      adAccountId,
      adId: { $in: adIds },
      date: { $gte: since, $lte: until },
    }).lean();

    const byAd = new Map<
      string,
      {
        adName?: string;
        spendCents: number;
        impressions: number;
        clicks: number;
        conversions: number;
        revenueCents: number;
      }
    >();

    for (const row of rows) {
      const cur = byAd.get(row.adId) ?? {
        adName: row.adName,
        spendCents: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenueCents: 0,
      };
      cur.adName = row.adName ?? cur.adName;
      cur.spendCents += row.spendCents;
      cur.impressions += row.impressions;
      cur.clicks += row.clicks;
      cur.conversions += row.conversions ?? 0;
      cur.revenueCents += row.revenueCents ?? 0;
      byAd.set(row.adId, cur);
    }

    const formatOrder: Record<string, number> = { video: 0, static: 1, carousel: 2, unknown: 3 };

    return [...byAd.entries()]
      .map(([adId, v]) => {
        const dest = destByAd.get(adId);
        const raw = dest?.adFormat;
        const adFormat: "video" | "static" | "carousel" | "unknown" =
          raw === "video" || raw === "static" || raw === "carousel" || raw === "unknown"
            ? raw
            : "unknown";
        return {
          adId,
          adName: v.adName,
          spendCents: v.spendCents,
          impressions: v.impressions,
          clicks: v.clicks,
          conversions: v.conversions,
          revenueCents: v.revenueCents,
          adFormat,
        };
      })
      .sort((a, b) => {
        const fa = formatOrder[a.adFormat] ?? 3;
        const fb = formatOrder[b.adFormat] ?? 3;
        if (fa !== fb) return fa - fb;
        return b.spendCents - a.spendCents;
      });
  }
}
