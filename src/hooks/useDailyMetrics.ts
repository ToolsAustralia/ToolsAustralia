/**
 * Hook for fetching daily metrics
 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet } from "@/lib/queries";
import type { DailyMetricsResponse } from "@/types/metrics/DailyMetrics";

export interface UseDailyMetricsParams {
  startDate: Date;
  endDate: Date;
  enabled?: boolean;
}

export function useDailyMetrics({ startDate, endDate, enabled = true }: UseDailyMetricsParams) {
  return useQuery({
    queryKey: queryKeys.admin.metrics.daily({ startDate: startDate.toISOString(), endDate: endDate.toISOString() }),
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
      const response = await apiGet<{ data: DailyMetricsResponse["data"]; meta: unknown }>(
        `/api/admin/metrics/daily?${params}`
      );
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false,
    enabled,
  });
}

