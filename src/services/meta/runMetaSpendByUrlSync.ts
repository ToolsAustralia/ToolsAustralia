import { MetaInsightsSyncService } from "@/services/meta/MetaInsightsSyncService";
import { MetaAdDestinationService } from "@/services/meta/MetaAdDestinationService";
import { SpendByUrlAggregationService } from "@/services/analytics/SpendByUrlAggregationService";

/** Optional human-readable progress (e.g. CLI with timestamps). */
export type RunMetaSpendByUrlSyncProgress = (message: string) => void;

export interface RunMetaSpendByUrlSyncResult {
  insights: {
    rowsUpserted: number;
    adIds: string[];
  };
  destinations: {
    upserted: number;
    missingUrlAds: string[];
  };
  aggregation: {
    datesProcessed: number;
    rowsWritten: number;
  };
}

/**
 * End-to-end: daily ad insights → ad destinations → landing page aggregates.
 */
export async function runMetaSpendByUrlSync(
  adAccountId: string,
  accessToken: string,
  dateRange: { since: string; until: string },
  options?: { onProgress?: RunMetaSpendByUrlSyncProgress }
): Promise<RunMetaSpendByUrlSyncResult> {
  const log = options?.onProgress;
  const insightsService = new MetaInsightsSyncService();
  const destService = new MetaAdDestinationService();
  const aggService = new SpendByUrlAggregationService();

  const syncInsights = await insightsService.syncDateRange(adAccountId, accessToken, dateRange, {
    onProgress: log,
  });

  log?.(
    `[destinations] Fetching creative landing URLs from Graph API for ${syncInsights.adIds.length} ads (batched)…`
  );
  const syncDest = await destService.syncDestinationsForAdIds(
    adAccountId,
    accessToken,
    syncInsights.adIds,
    { onProgress: log }
  );

  log?.(`[aggregate] Rebuilding per-URL daily metrics for ${dateRange.since} → ${dateRange.until}…`);
  const agg = await aggService.recomputeForDateRange(adAccountId, dateRange.since, dateRange.until, {
    onProgress: log,
  });

  log?.(
    `[done] Sync complete — insights rows: ${syncInsights.rowsUpserted}, destinations upserted: ${syncDest.upserted}, aggregate rows written: ${agg.rowsWritten}.`
  );

  return {
    insights: {
      rowsUpserted: syncInsights.rowsUpserted,
      adIds: syncInsights.adIds,
    },
    destinations: {
      upserted: syncDest.upserted,
      missingUrlAds: syncDest.missingUrlAds,
    },
    aggregation: agg,
  };
}
