/**
 * Hook for fetching daily user metrics data
 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet } from "@/lib/queries";
import type { IDailyUserMetrics } from "@/types/metrics/DailyUserMetrics";

export interface UseDailyUserMetricsParams {
  startDate: Date;
  endDate: Date;
  enabled?: boolean;
}

export function useDailyUserMetrics({ startDate, endDate, enabled = true }: UseDailyUserMetricsParams) {
  return useQuery({
    queryKey: ["admin", "metrics", "users", "daily", startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("startDate", startDate.toISOString());
      params.append("endDate", endDate.toISOString());
      params.append("daily", "true");

      const response = await apiGet<{ data: IDailyUserMetrics[]; meta: { timestamp: string; cached: boolean; count: number; daily: boolean } }>(
        `/api/admin/metrics/users?${params}`
      );
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false,
    enabled,
  });
}

