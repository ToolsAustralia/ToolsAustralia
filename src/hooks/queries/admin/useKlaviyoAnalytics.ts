import { useQuery } from "@tanstack/react-query";
import type { KlaviyoAnalytics, KlaviyoTimeframeKey } from "@/services/admin/klaviyo/klaviyoReporting";

export type { KlaviyoTimeframeKey };

export interface KlaviyoAnalyticsResponse {
  data: KlaviyoAnalytics;
  stale: boolean;
  cachedAt: number;
}

/**
 * Klaviyo-attributed campaign/flow revenue + scheduled view (SHARED-2,
 * GET /api/admin/klaviyo/analytics). Long staleTime + NO refetch interval / focus
 * refetch — the Klaviyo reporting API is throttled (~2/min) and the route caches.
 */
export function useKlaviyoAnalytics(range: KlaviyoTimeframeKey = "last_30_days", enabled = true) {
  return useQuery<KlaviyoAnalyticsResponse>({
    queryKey: ["admin", "klaviyo", "analytics", range],
    enabled,
    queryFn: async (): Promise<KlaviyoAnalyticsResponse> => {
      const res = await fetch(`/api/admin/klaviyo/analytics?range=${range}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || err.details || `Failed to load Klaviyo analytics: ${res.statusText}`);
      }
      const json = await res.json();
      if (!json.success || !json.data) throw new Error(json.error || "No data returned");
      return { data: json.data, stale: Boolean(json.stale), cachedAt: json.cachedAt };
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
