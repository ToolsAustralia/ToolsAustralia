import { MetaInsightsSyncService } from "@/services/meta/MetaInsightsSyncService";
import { MetaAdDestinationService } from "@/services/meta/MetaAdDestinationService";
import { SpendByUrlAggregationService } from "@/services/analytics/SpendByUrlAggregationService";

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
  dateRange: { since: string; until: string }
): Promise<RunMetaSpendByUrlSyncResult> {
  const insightsService = new MetaInsightsSyncService();
  const destService = new MetaAdDestinationService();
  const aggService = new SpendByUrlAggregationService();

  const syncInsights = await insightsService.syncDateRange(adAccountId, accessToken, dateRange);

  const syncDest = await destService.syncDestinationsForAdIds(
    adAccountId,
    accessToken,
    syncInsights.adIds
  );

  const agg = await aggService.recomputeForDateRange(adAccountId, dateRange.since, dateRange.until);

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
