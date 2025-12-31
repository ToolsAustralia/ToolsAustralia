/**
 * Hook for fetching monthly comparison data
 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet } from "@/lib/queries";
import type { MonthlyComparisonResponse } from "@/types/metrics/MonthlyComparison";

export interface UseMonthlyComparisonParams {
  month: string; // YYYY-MM format
  enabled?: boolean;
}

export function useMonthlyComparison({ month, enabled = true }: UseMonthlyComparisonParams) {
  return useQuery({
    queryKey: queryKeys.admin.metrics.monthlyComparison(month),
    queryFn: async () => {
      const params = new URLSearchParams({ month });
      const response = await apiGet<{ data: MonthlyComparisonResponse["data"]; meta: unknown }>(
        `/api/admin/metrics/monthly-comparison?${params}`
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

