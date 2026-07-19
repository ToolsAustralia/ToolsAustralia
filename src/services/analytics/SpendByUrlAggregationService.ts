import MetaAdInsightsDaily from "@/models/MetaAdInsightsDaily";
import MetaAdDestination from "@/models/MetaAdDestination";
import LandingPageMetricsDaily from "@/models/LandingPageMetricsDaily";
import type { ILandingPackagesFocusSplit } from "@/models/LandingPageMetricsDaily";
import {
  derivePackagesFocusForDestination,
  type PackagesFocus,
  type PackagesFocusBucket,
} from "@/utils/metrics/packages-focus";

function centsToAud(cents: number): number {
  return Math.round(cents) / 100;
}

function emptyFocusMetrics() {
  return { spendCents: 0, impressions: 0, clicks: 0, conversions: 0, revenueCents: 0 };
}

type FocusAccumulator = ILandingPackagesFocusSplit;

export interface LandingPageDailyDoc {
  adAccountId: string;
  date: string;
  canonicalUrl: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenueCents: number;
  adIds: string[];
  packagesFocus?: ILandingPackagesFocusSplit;
  computedAt: Date;
}

/**
 * Pure per-day aggregation: insights × destinations → LandingPageMetricsDaily docs.
 * Extracted from recomputeForDateRange so the focus-split math is unit-testable
 * without Mongo. Row totals are accumulated exactly as before; additionally each
 * RESOLVED row carries a packagesFocus split (membership vs one-time per ad,
 * classified from the ad's primary raw URL). unknown:// rows get no split —
 * readers treat them as the "unclassified" bucket.
 */
export function buildLandingPageDailyDocs(params: {
  adAccountId: string;
  date: string;
  computedAt: Date;
  insights: Array<{
    adId: string;
    spendCents: number;
    impressions: number;
    clicks: number;
    conversions?: number | null;
    revenueCents?: number | null;
  }>;
  destByAd: Map<string, { canonicalUrl?: string | null; rawUrls?: string[] | null }>;
}): LandingPageDailyDoc[] {
  const agg = new Map<
    string,
    {
      spendCents: number;
      impressions: number;
      clicks: number;
      conversions: number;
      revenueCents: number;
      adIds: Set<string>;
      focus?: FocusAccumulator;
    }
  >();

  for (const row of params.insights) {
    const dest = params.destByAd.get(row.adId);
    const canonicalUrl = dest?.canonicalUrl ?? `unknown://meta-ad/${row.adId}`;

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

    const bucket = derivePackagesFocusForDestination(dest);
    if (bucket !== "unclassified") {
      cur.focus ??= { membership: emptyFocusMetrics(), "one-time": emptyFocusMetrics() };
      const slice = cur.focus[bucket as PackagesFocus];
      slice.spendCents += row.spendCents;
      slice.impressions += row.impressions;
      slice.clicks += row.clicks;
      slice.conversions += row.conversions ?? 0;
      slice.revenueCents += row.revenueCents ?? 0;
    }

    agg.set(canonicalUrl, cur);
  }

  return [...agg.entries()].map(([canonicalUrl, v]) => ({
    adAccountId: params.adAccountId,
    date: params.date,
    canonicalUrl,
    spendCents: v.spendCents,
    impressions: v.impressions,
    clicks: v.clicks,
    conversions: v.conversions,
    revenueCents: v.revenueCents,
    adIds: [...v.adIds],
    ...(v.focus ? { packagesFocus: v.focus } : {}),
    computedAt: params.computedAt,
  }));
}

export interface SpendByUrlFocusTotals {
  spend: number;          // AUD dollars
  spendCents: number;
  revenue: number;        // AUD dollars
  revenueCents: number;
  conversions: number;
  roas: number;           // ratio; 0 when spend is 0
}

export interface SpendByUrlListRow {
  canonicalUrl: string;
  spend: number;          // AUD dollars
  spendCents: number;     // Stripe-style cents
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;        // AUD dollars
  revenueCents: number;
  cpc: number;            // AUD per click; 0 when clicks is 0
  roas: number;           // ratio; 0 when spend is 0
  adIds: string[];
  /** membership vs one-time split of this row; absent = row predates the split or is unknown:// (unclassified) */
  packagesFocus?: {
    membership: SpendByUrlFocusTotals;
    "one-time": SpendByUrlFocusTotals;
  };
}

export interface SpendByUrlListResult {
  meta: {
    startDate: string;
    endDate: string;
    currency: "AUD";
    adAccountId: string;
  };
  rows: SpendByUrlListRow[];
}

export interface SpendByUrlDetailRow {
  adId: string;
  adName?: string;
  spend: number;          // AUD dollars
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;        // AUD dollars
  revenueCents: number;
  cpc: number;            // AUD per click
  roas: number;           // ratio
  adFormat: "video" | "static" | "carousel" | "unknown";
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adsetName?: string;
  /** Landing-URL strategy of this ad; "unclassified" = destination unresolved (unknown:// or no dest doc) */
  packagesFocus: PackagesFocusBucket;
}

export interface SpendByUrlDetailResult {
  meta: {
    canonicalUrls: string[];
    canonicalUrl: string;       // @deprecated — first of canonicalUrls; kept for single-URL clients
    startDate: string;
    endDate: string;
    currency: "AUD";
    adAccountId: string;
  };
  rows: SpendByUrlDetailRow[];
}

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

export type SpendByUrlDetailAggRow = {
  adId: string;
  adName?: string;
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adsetName?: string;
  packagesFocus: PackagesFocusBucket;
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenueCents: number;
  adFormat: "video" | "static" | "carousel" | "unknown";
};

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

      await LandingPageMetricsDaily.deleteMany({ adAccountId, date });

      const docs = buildLandingPageDailyDocs({
        adAccountId,
        date,
        computedAt: new Date(),
        insights: insights.map((i) => ({
          adId: i.adId,
          spendCents: i.spendCents,
          impressions: i.impressions,
          clicks: i.clicks,
          conversions: i.conversions,
          revenueCents: i.revenueCents,
        })),
        destByAd: new Map(dests.map((d) => [d.adId, { canonicalUrl: d.canonicalUrl, rawUrls: d.rawUrls }])),
      });

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
      packagesFocus?: ILandingPackagesFocusSplit;
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
        focus?: FocusAccumulator;
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
      if (row.packagesFocus) {
        cur.focus ??= { membership: emptyFocusMetrics(), "one-time": emptyFocusMetrics() };
        for (const key of ["membership", "one-time"] as const) {
          const s = row.packagesFocus[key];
          cur.focus[key].spendCents += s.spendCents;
          cur.focus[key].impressions += s.impressions;
          cur.focus[key].clicks += s.clicks;
          cur.focus[key].conversions += s.conversions;
          cur.focus[key].revenueCents += s.revenueCents;
        }
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
        ...(v.focus ? { packagesFocus: v.focus } : {}),
      }))
      .sort((a, b) => b.spendCents - a.spendCents);
  }

  /**
   * Placeholder when no website URL was resolved; embeds the Meta ad id.
   * @see MetaAdDestinationService — if Graph API errors on the ad, no destination doc exists,
   * but aggregation still buckets spend under this string, so drill-down must not rely on MetaAdDestination alone.
   */
  private static readonly UNKNOWN_META_AD_RE = /^unknown:\/\/meta-ad\/(\d+)$/;

  /**
   * Resolve ad ids and destination docs for one canonical URL (same rules as legacy drill-down).
   */
  private async collectAdIdsAndDestsForCanonicalUrl(
    adAccountId: string,
    canonicalUrl: string,
    since: string,
    until: string
  ): Promise<{ adIds: string[]; destByAd: Map<string, (typeof dests)[number]> }> {
    const dests = await MetaAdDestination.find({ adAccountId, canonicalUrl }).lean();
    const destByAd = new Map(dests.map((d) => [d.adId, d] as [string, (typeof dests)[number]]));
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

    return { adIds, destByAd };
  }

  /**
   * Per-ad totals for one or more canonical URLs (union of ads, single insights query).
   */
  async getSpendByUrlDetailForCanonicalUrls(
    adAccountId: string,
    canonicalUrls: string[],
    since: string,
    until: string
  ): Promise<SpendByUrlDetailAggRow[]> {
    const uniqueUrls = [...new Set(canonicalUrls.map((u) => u.trim()).filter(Boolean))];
    if (uniqueUrls.length === 0) {
      return [];
    }

    const mergedDestByAd = new Map<
      string,
      { adFormat?: string; canonicalUrl?: string | null; rawUrls?: string[] | null }
    >();
    const adIdSet = new Set<string>();

    for (const canonicalUrl of uniqueUrls) {
      const { adIds, destByAd } = await this.collectAdIdsAndDestsForCanonicalUrl(
        adAccountId,
        canonicalUrl,
        since,
        until
      );
      for (const [id, d] of destByAd) {
        const doc = d as { adFormat?: string; canonicalUrl?: string | null; rawUrls?: string[] | null };
        mergedDestByAd.set(id, {
          adFormat: doc.adFormat,
          canonicalUrl: doc.canonicalUrl,
          rawUrls: doc.rawUrls,
        });
      }
      for (const id of adIds) {
        adIdSet.add(id);
      }
    }

    const adIds = [...adIdSet];
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
        campaignId?: string;
        campaignName?: string;
        adsetId?: string;
        adsetName?: string;
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
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        adsetId: row.adsetId,
        adsetName: row.adsetName,
        spendCents: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenueCents: 0,
      };
      cur.adName = row.adName ?? cur.adName;
      // campaign/adset are denormalized per insights row — latest-non-null wins
      cur.campaignId = row.campaignId ?? cur.campaignId;
      cur.campaignName = row.campaignName ?? cur.campaignName;
      cur.adsetId = row.adsetId ?? cur.adsetId;
      cur.adsetName = row.adsetName ?? cur.adsetName;
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
        const dest = mergedDestByAd.get(adId);
        const raw = dest?.adFormat;
        const adFormat: "video" | "static" | "carousel" | "unknown" =
          raw === "video" || raw === "static" || raw === "carousel" || raw === "unknown"
            ? raw
            : "unknown";
        const packagesFocus = derivePackagesFocusForDestination(dest);
        return {
          adId,
          adName: v.adName,
          campaignId: v.campaignId,
          campaignName: v.campaignName,
          adsetId: v.adsetId,
          adsetName: v.adsetName,
          packagesFocus,
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

  /**
   * Per-ad totals for one canonical URL (drill-down).
   */
  async getSpendByUrlDetail(
    adAccountId: string,
    canonicalUrl: string,
    since: string,
    until: string
  ): Promise<SpendByUrlDetailAggRow[]> {
    return this.getSpendByUrlDetailForCanonicalUrls(adAccountId, [canonicalUrl], since, until);
  }

  /**
   * Aggregated spend-by-url list, formatted for HTTP consumers (cents → AUD,
   * derived `cpc` and `roas`). Shared by the admin route and the Norm
   * projection so the two surfaces match by construction.
   */
  async getSpendByUrlListFormatted(
    adAccountId: string,
    since: string,
    until: string
  ): Promise<SpendByUrlListResult> {
    const rows = await this.getAggregatedSpendByUrl(adAccountId, since, until);
    return {
      meta: { startDate: since, endDate: until, currency: "AUD", adAccountId },
      rows: rows.map((r) => {
        const spend = centsToAud(r.spendCents);
        const revenue = centsToAud(r.revenueCents);
        const formatFocus = (m: { spendCents: number; revenueCents: number; conversions: number }) => {
          const fSpend = centsToAud(m.spendCents);
          const fRevenue = centsToAud(m.revenueCents);
          return {
            spend: fSpend,
            spendCents: m.spendCents,
            revenue: fRevenue,
            revenueCents: m.revenueCents,
            conversions: m.conversions,
            roas: fSpend > 0 ? fRevenue / fSpend : 0,
          };
        };
        return {
          canonicalUrl: r.canonicalUrl,
          spend,
          spendCents: r.spendCents,
          impressions: r.impressions,
          clicks: r.clicks,
          conversions: r.conversions,
          revenue,
          revenueCents: r.revenueCents,
          cpc: r.clicks > 0 ? spend / r.clicks : 0,
          roas: spend > 0 ? revenue / spend : 0,
          adIds: r.adIds,
          ...(r.packagesFocus
            ? {
                packagesFocus: {
                  membership: formatFocus(r.packagesFocus.membership),
                  "one-time": formatFocus(r.packagesFocus["one-time"]),
                },
              }
            : {}),
        };
      }),
    };
  }

  /**
   * Per-ad detail breakdown for one or more canonical URLs, formatted for HTTP
   * consumers. Shared by admin + Norm.
   */
  async getSpendByUrlDetailFormatted(
    adAccountId: string,
    canonicalUrls: string[],
    since: string,
    until: string
  ): Promise<SpendByUrlDetailResult> {
    const uniqueCanonicalUrls = [...new Set(canonicalUrls.map((u) => u.trim()).filter(Boolean))];
    const rows = await this.getSpendByUrlDetailForCanonicalUrls(
      adAccountId,
      uniqueCanonicalUrls,
      since,
      until
    );
    return {
      meta: {
        canonicalUrls: uniqueCanonicalUrls,
        canonicalUrl: uniqueCanonicalUrls[0] ?? "",
        startDate: since,
        endDate: until,
        currency: "AUD",
        adAccountId,
      },
      rows: rows.map((r) => {
        const spend = centsToAud(r.spendCents);
        const revenue = centsToAud(r.revenueCents);
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
          cpc: r.clicks > 0 ? spend / r.clicks : 0,
          roas: spend > 0 ? revenue / spend : 0,
          adFormat: r.adFormat,
          campaignId: r.campaignId,
          campaignName: r.campaignName,
          adsetId: r.adsetId,
          adsetName: r.adsetName,
          packagesFocus: r.packagesFocus,
        };
      }),
    };
  }
}
