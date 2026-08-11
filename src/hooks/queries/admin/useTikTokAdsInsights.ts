import { useQuery } from "@tanstack/react-query";
// Type-only imports (erased at build) — keep the Mongoose models out of the client bundle.
import type {
  TikTokAdInsightsResult as TikTokAdInsightsQueryResult,
  TikTokInsightLevel as TikTokInsightLevelType,
} from "@/services/admin/tiktok/tiktokAdInsightsQuery";
import type { TikTokSyncHealth } from "@/services/admin/tiktok/tiktokSyncStatus";

export type {
  TikTokAdInsightsRow,
  TikTokInsightLevel,
} from "@/services/admin/tiktok/tiktokAdInsightsQuery";
export type { TikTokSyncHealth, TikTokSyncRunSummary } from "@/services/admin/tiktok/tiktokSyncStatus";

/** Route payload = the service result + syncHealth composed by the admin route (F-002). */
export type TikTokAdInsightsResult = TikTokAdInsightsQueryResult & {
  syncHealth?: TikTokSyncHealth;
};

/**
 * React Query hook for the TikTok spend breakdown (spend + TikTok-reported
 * conversions/revenue + ROAS) at campaign / ad-set / ad level, plus sync health. Mirrors
 * useFacebookAdsInsights; reads GET /api/admin/tiktok-ads/insights.
 */
export function useTikTokAdsInsights(params: {
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  /** Grouping granularity. Defaults to "ad" — the pre-switcher behaviour. */
  level?: TikTokInsightLevelType;
  enabled?: boolean;
}) {
  const { startDate, endDate, level = "ad", enabled = true } = params;

  return useQuery<TikTokAdInsightsResult>({
    // `level` is part of the key: the rows are a different grouping of the same window, so
    // sharing a key across levels would serve campaign rows to the ad view until refetch.
    queryKey: ["admin", "tiktok-ads", "insights", startDate, endDate, level],
    enabled: enabled && !!startDate && !!endDate,
    queryFn: async (): Promise<TikTokAdInsightsResult> => {
      if (!startDate || !endDate) throw new Error("startDate and endDate are required");

      const searchParams = new URLSearchParams({ startDate, endDate, level });
      const response = await fetch(`/api/admin/tiktok-ads/insights?${searchParams.toString()}`);

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
        throw new Error(errorData.error || `Failed to fetch TikTok ad insights: ${response.statusText}`);
      }

      const result: { success: boolean; data?: TikTokAdInsightsResult; error?: string } =
        await response.json();
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to fetch TikTok ad insights");
      }
      return result.data;
    },
    staleTime: 1 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 2 * 60 * 1000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
