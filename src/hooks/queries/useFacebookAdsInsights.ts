import { useQuery } from "@tanstack/react-query";
import type { FacebookAdsInsightsResponse, DateRangeOption, InsightLevel } from "@/types/facebook-ads";

/**
 * React Query hook for fetching Facebook Ads insights
 *
 * Features:
 * - Type-safe query parameters
 * - Automatic caching with stale-while-revalidate
 * - Error handling
 * - Loading states
 * - Refetch on window focus (disabled for admin)
 *
 * @param params - Query parameters for fetching insights
 * @returns React Query result with insights data
 */
export function useFacebookAdsInsights(params: {
  dateRange: DateRangeOption;
  startDate?: string;
  endDate?: string;
  level: InsightLevel;
  refresh?: boolean;
}) {
  return useQuery<FacebookAdsInsightsResponse["data"]>({
    queryKey: ["admin", "facebook-ads", "insights", params],
    queryFn: async (): Promise<FacebookAdsInsightsResponse["data"]> => {
      // Build query string
      const searchParams = new URLSearchParams();
      searchParams.append("dateRange", params.dateRange);
      searchParams.append("level", params.level);

      if (params.dateRange === "custom") {
        if (params.startDate) {
          searchParams.append("startDate", params.startDate);
        }
        if (params.endDate) {
          searchParams.append("endDate", params.endDate);
        }
      }

      if (params.refresh) {
        searchParams.append("refresh", "true");
      }

      const response = await fetch(`/api/admin/facebook-ads/insights?${searchParams.toString()}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
        }));

        throw new Error(errorData.error || errorData.details || `Failed to fetch insights: ${response.statusText}`);
      }

      const result: FacebookAdsInsightsResponse = await response.json();

      if (!result.success) {
        throw new Error(result.error || result.details || "Failed to fetch Facebook ads insights");
      }

      if (!result.data) {
        throw new Error("No data returned from API");
      }

      return result.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - matches cache TTL
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache longer
    refetchOnWindowFocus: false, // Don't refetch on window focus for admin
    retry: 2, // Retry failed requests twice
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });
}







