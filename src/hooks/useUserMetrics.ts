/**
 * Hook for fetching user metrics data
 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet } from "@/lib/queries";
import type { UserMetricsResponse } from "@/types/metrics/UserMetrics";

export interface UseUserMetricsParams {
  startDate?: Date;
  endDate?: Date;
  enabled?: boolean;
}

export function useUserMetrics({ startDate, endDate, enabled = true }: UseUserMetricsParams = {}) {
  return useQuery({
    queryKey: queryKeys.admin.metrics.userMetrics(startDate, endDate),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) {
        params.append("startDate", startDate.toISOString());
      }
      if (endDate) {
        params.append("endDate", endDate.toISOString());
      }

      const response = await apiGet<{ data: UserMetricsResponse["data"]; meta: UserMetricsResponse["meta"] }>(
        `/api/admin/metrics/users?${params}`
      );
      return response.data;
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false,
    enabled,
  });
}



