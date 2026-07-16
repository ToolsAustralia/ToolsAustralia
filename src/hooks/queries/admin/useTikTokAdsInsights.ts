import { useQuery } from "@tanstack/react-query";
// Type-only import (erased at build) — keeps the Mongoose model out of the client bundle.
import type { TikTokAdInsightsResult } from "@/services/admin/tiktok/tiktokAdInsightsQuery";

export type { TikTokAdInsightsResult, TikTokAdInsightsRow } from "@/services/admin/tiktok/tiktokAdInsightsQuery";

/**
 * React Query hook for the per-TikTok-ad breakdown (adName + spend + TikTok-reported
 * conversions/revenue + ROAS). Mirrors useFacebookAdsInsights; reads
 * GET /api/admin/tiktok-ads/insights.
 */
export function useTikTokAdsInsights(params: {
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  enabled?: boolean;
}) {
  const { startDate, endDate, enabled = true } = params;

  return useQuery<TikTokAdInsightsResult>({
    queryKey: ["admin", "tiktok-ads", "insights", startDate, endDate],
    enabled: enabled && !!startDate && !!endDate,
    queryFn: async (): Promise<TikTokAdInsightsResult> => {
      if (!startDate || !endDate) throw new Error("startDate and endDate are required");

      const searchParams = new URLSearchParams({ startDate, endDate });
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
