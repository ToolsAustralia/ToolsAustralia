import {
  metaSpendByUrlDescriptor,
  runSpendByUrlSync,
} from "@/services/analytics/runSpendByUrlSync";

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
 * End-to-end Meta sync: daily ad insights → ad destinations → landing page aggregates.
 *
 * Now a thin binding over the platform-agnostic `runSpendByUrlSync` — the sequencing lives
 * there so TikTok (and anything after it) runs the identical pipeline. Kept as a named
 * function with its original signature and result shape because four callers (2 crons, the
 * admin "Sync from Meta" route, and the ops script) depend on it; there is no behavioural
 * reason to churn them.
 */
export async function runMetaSpendByUrlSync(
  adAccountId: string,
  accessToken: string,
  dateRange: { since: string; until: string },
  options?: { onProgress?: RunMetaSpendByUrlSyncProgress }
): Promise<RunMetaSpendByUrlSyncResult> {
  const result = await runSpendByUrlSync(
    metaSpendByUrlDescriptor(adAccountId, accessToken),
    dateRange,
    { onProgress: options?.onProgress }
  );

  return {
    insights: result.insights,
    destinations: {
      upserted: result.destinations.upserted,
      missingUrlAds: result.destinations.missingUrlAds,
    },
    aggregation: result.aggregation,
  };
}
