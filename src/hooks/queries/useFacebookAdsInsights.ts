import { useQuery } from "@tanstack/react-query";
import type { FacebookAdsInsightsResponse, DateRangeOption, InsightLevel, HourlyInsightsResponse } from "@/types/facebook-ads";

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
  enabled?: boolean;
}) {
  const { enabled = true, ...apiParams } = params;

  return useQuery<FacebookAdsInsightsResponse["data"]>({
    queryKey: ["admin", "facebook-ads", "insights", apiParams],
    enabled,
    queryFn: async (): Promise<FacebookAdsInsightsResponse["data"]> => {
      // Build query string
      const searchParams = new URLSearchParams();
      searchParams.append("dateRange", apiParams.dateRange);
      searchParams.append("level", apiParams.level);

      if (apiParams.dateRange === "custom") {
        if (apiParams.startDate) {
          searchParams.append("startDate", apiParams.startDate);
        }
        if (apiParams.endDate) {
          searchParams.append("endDate", apiParams.endDate);
        }
      }

      if (apiParams.refresh) {
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
    staleTime: 1 * 60 * 1000, // 1 minute - consider data stale so refetch happens sooner
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache longer
    refetchOnWindowFocus: true, // Refetch when returning to tab so latest purchases show up
    refetchInterval: 2 * 60 * 1000, // Auto-refresh every 2 minutes while tab is open
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * React Query hook for fetching hourly Facebook Ads insights
 * Combines Facebook hourly data (spend, impressions, clicks) with PaymentEvent data (revenue, conversions)
 *
 * @param params - Query parameters for fetching hourly insights
 * @returns React Query result with hourly insights data
 */
export function useHourlyInsights(params: {
  startDate?: string; // YYYY-MM-DD format
  endDate?: string; // YYYY-MM-DD format
  enabled?: boolean; // Whether to run the query
  filterLevel?: "campaign" | "adset" | "ad"; // Filter by campaign, ad set, or ad
  filterIds?: string[]; // IDs to filter (empty = all)
}) {
  const { startDate, endDate, enabled = true, filterLevel, filterIds } = params;

  return useQuery<HourlyInsightsResponse["data"]>({
    queryKey: ["admin", "facebook-ads", "hourly-insights", startDate, endDate, filterLevel, filterIds],
    queryFn: async (): Promise<HourlyInsightsResponse["data"]> => {
      if (!startDate || !endDate) {
        throw new Error("startDate and endDate are required");
      }

      // Use POST when filterIds present to avoid HTTP 431 (Request Header Fields Too Large)
      const usePost = filterLevel && filterIds && filterIds.length > 0;

      let response: Response;
      if (usePost) {
        response = await fetch("/api/admin/facebook-ads/hourly-insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate, endDate, filterLevel, filterIds }),
        });
      } else {
        const searchParams = new URLSearchParams();
        searchParams.append("startDate", startDate);
        searchParams.append("endDate", endDate);
        if (filterLevel && filterIds && filterIds.length > 0) {
          searchParams.append("filterLevel", filterLevel);
          searchParams.append("filterIds", filterIds.join(","));
        }
        response = await fetch(`/api/admin/facebook-ads/hourly-insights?${searchParams.toString()}`);
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
        }));

        throw new Error(errorData.error || errorData.details || `Failed to fetch hourly insights: ${response.statusText}`);
      }

      const result: HourlyInsightsResponse = await response.json();

      if (!result.success) {
        throw new Error(result.error || result.details || "Failed to fetch hourly insights");
      }

      if (!result.data) {
        throw new Error("No data returned from API");
      }

      return result.data;
    },
    enabled: enabled && !!startDate && !!endDate,
    staleTime: 1 * 60 * 1000, // 1 minute - so conversions from your DB update sooner
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true, // Refetch when returning to tab
    refetchInterval: 2 * 60 * 1000, // Auto-refresh every 2 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}












