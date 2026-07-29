import type { AdDestinationPlatform } from "@/models/AdDestination";
import { SpendByUrlAggregationService } from "@/services/analytics/SpendByUrlAggregationService";
import {
  writeAdDestinations,
  type AdDestinationResolver,
  type WriteDestinationsResult,
} from "@/services/analytics/adDestinationWriter";
import { MetaInsightsSyncService } from "@/services/meta/MetaInsightsSyncService";
import { MetaAdDestinationService } from "@/services/meta/MetaAdDestinationService";
import { TikTokInsightsSyncService } from "@/services/admin/tiktok/TikTokInsightsSyncService";
import { TikTokAdDestinationService } from "@/services/admin/tiktok/TikTokAdDestinationService";

/**
 * The platform-agnostic spend-by-URL pipeline: insights → destinations → aggregates.
 *
 * All three ad platforms run the SAME three steps in the same order; they differ only in
 * how the first two are performed (which API, which credential, which id space). So the
 * sequencing, logging, and result shape live here once, and each platform contributes a
 * DESCRIPTOR supplying just its two fetch steps.
 *
 * Adding a third platform is then a descriptor + a resolver — not a fourth copy of this
 * orchestration, and not a fourth place to forget the platform argument on the aggregate
 * rebuild (which deletes by platform; see SpendByUrlAggregationService).
 */

export type RunSpendByUrlSyncProgress = (message: string) => void;

export interface SpendByUrlInsightsResult {
  /** false = credentials absent. A clean no-op, NOT an error. */
  configured: boolean;
  rowsUpserted: number;
  adIds: string[];
  /**
   * Window sums, when the platform's sync computes them. Feeds the metric-name tripwire:
   * an API that returns only the metrics you NAME answers a misspelled name with confident
   * zeros rather than an error, so "real clicks, zero conversions, zero revenue across a
   * whole window" is the signature of a wrong metric name — not of a bad ad account.
   */
  totals?: { clicks: number; conversions: number; revenueCents: number };
}

/**
 * One platform's half of the pipeline. `adAccountId` must be the SAME identifier the
 * platform's insights rows are stamped with (Meta: act_<id>; TikTok: advertiser_id), because
 * the aggregate rebuild joins and deletes on it.
 */
export interface SpendByUrlSyncDescriptor {
  platform: AdDestinationPlatform;
  adAccountId: string;
  syncInsights(
    dateRange: { since: string; until: string },
    options?: { onProgress?: RunSpendByUrlSyncProgress },
  ): Promise<SpendByUrlInsightsResult>;
  syncDestinations(
    adIds: string[],
    options?: { onProgress?: RunSpendByUrlSyncProgress },
  ): Promise<WriteDestinationsResult>;
}

export interface RunSpendByUrlSyncResult {
  platform: AdDestinationPlatform;
  /** false when the platform's creds are absent — every count is 0 and nothing was written. */
  configured: boolean;
  insights: {
    rowsUpserted: number;
    adIds: string[];
    totals?: { clicks: number; conversions: number; revenueCents: number };
  };
  destinations: {
    upserted: number;
    missingUrlAds: string[];
    /** resolved ÷ requested, 0–1. A drop means the platform changed its creative shape. */
    coverage: number;
    requested: number;
  };
  aggregation: { datesProcessed: number; rowsWritten: number };
}

/**
 * End-to-end for one platform. Never invents data: an unconfigured platform returns
 * `configured:false` with zeros and skips the aggregate rebuild entirely (rebuilding from
 * zero insight rows would DELETE that platform's existing rows for the window).
 */
export async function runSpendByUrlSync(
  descriptor: SpendByUrlSyncDescriptor,
  dateRange: { since: string; until: string },
  options?: { onProgress?: RunSpendByUrlSyncProgress },
): Promise<RunSpendByUrlSyncResult> {
  const log = options?.onProgress;
  const { platform, adAccountId } = descriptor;

  const insights = await descriptor.syncInsights(dateRange, { onProgress: log });

  if (!insights.configured) {
    log?.(`[${platform}] Skipped — credentials not configured.`);
    return {
      platform,
      configured: false,
      insights: { rowsUpserted: 0, adIds: [] },
      destinations: { upserted: 0, missingUrlAds: [], coverage: 1, requested: 0 },
      aggregation: { datesProcessed: 0, rowsWritten: 0 },
    };
  }

  log?.(
    `[${platform}/destinations] Resolving landing URLs for ${insights.adIds.length} ad(s)…`,
  );
  const destinations = await descriptor.syncDestinations(insights.adIds, { onProgress: log });

  // Coverage is the early-warning signal for a platform changing its creative shape: the
  // pipeline keeps working (unresolved ads become unknown:// rows) but spend silently stops
  // landing on real URLs. Surfacing it here means every caller's logs carry the warning.
  if (destinations.requested > 0 && destinations.coverage < 0.8) {
    console.error(
      `[${platform}/destinations] LOW COVERAGE ${(destinations.coverage * 100).toFixed(1)}% — ` +
        `${destinations.missingUrlAds.length}/${destinations.requested} ads have no usable landing URL. ` +
        `Their spend will aggregate under unknown://${platform}-ad/<id> instead of a real page.`,
    );
  }

  log?.(
    `[${platform}/aggregate] Rebuilding per-URL daily metrics for ${dateRange.since} → ${dateRange.until}…`,
  );
  const aggregation = await new SpendByUrlAggregationService().recomputeForDateRange(
    platform,
    adAccountId,
    dateRange.since,
    dateRange.until,
    { onProgress: log },
  );

  log?.(
    `[${platform}/done] insights rows: ${insights.rowsUpserted}, destinations upserted: ` +
      `${destinations.upserted} (coverage ${(destinations.coverage * 100).toFixed(1)}%), ` +
      `aggregate rows written: ${aggregation.rowsWritten}.`,
  );

  return {
    platform,
    configured: true,
    insights: {
      rowsUpserted: insights.rowsUpserted,
      adIds: insights.adIds,
      totals: insights.totals,
    },
    destinations,
    aggregation,
  };
}

/** Meta descriptor. Its destination service predates the resolver seam, so it self-writes. */
export function metaSpendByUrlDescriptor(
  adAccountId: string,
  accessToken: string,
): SpendByUrlSyncDescriptor {
  return {
    platform: "meta",
    adAccountId,
    async syncInsights(dateRange, options) {
      const r = await new MetaInsightsSyncService().syncDateRange(
        adAccountId,
        accessToken,
        dateRange,
        { onProgress: options?.onProgress },
      );
      return { configured: true, rowsUpserted: r.rowsUpserted, adIds: r.adIds };
    },
    async syncDestinations(adIds, options) {
      const r = await new MetaAdDestinationService().syncDestinationsForAdIds(
        adAccountId,
        accessToken,
        adIds,
        { onProgress: options?.onProgress },
      );
      const requested = [...new Set(adIds.filter(Boolean))].length;
      const resolved = requested - r.missingUrlAds.length;
      return {
        upserted: r.upserted,
        missingUrlAds: r.missingUrlAds,
        requested,
        coverage: requested > 0 ? resolved / requested : 1,
      };
    },
  };
}

/**
 * TikTok descriptor. Returns null when TIKTOK_ADVERTISER_ID is absent — callers treat that
 * as "platform not enabled here" rather than an error, so a Meta-only environment is
 * unaffected. The resolver implements AdDestinationResolver, so destination writing goes
 * through the shared writer (canonicalize → placeholder → flag multiUrl → upsert).
 */
export function tiktokSpendByUrlDescriptor(): SpendByUrlSyncDescriptor | null {
  const advertiserId = process.env.TIKTOK_ADVERTISER_ID?.trim();
  if (!advertiserId) return null;

  const resolver: AdDestinationResolver = new TikTokAdDestinationService();
  return {
    platform: "tiktok",
    adAccountId: advertiserId,
    async syncInsights(dateRange, options) {
      const r = await new TikTokInsightsSyncService().syncDateRange(dateRange, {
        onProgress: options?.onProgress,
      });
      return {
        configured: r.configured,
        rowsUpserted: r.rowsUpserted,
        adIds: r.adIds,
        totals: r.totals,
      };
    },
    async syncDestinations(adIds, options) {
      const resolved = await resolver.resolveForAdIds(adIds, {
        onProgress: options?.onProgress,
      });
      return writeAdDestinations({
        platform: "tiktok",
        adAccountId: advertiserId,
        requestedAdIds: adIds,
        resolved,
      });
    },
  };
}
