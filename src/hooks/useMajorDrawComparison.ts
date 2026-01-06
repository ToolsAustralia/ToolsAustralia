/**
 * Hook for fetching major draw comparison data
 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet } from "@/lib/queries";
import type { MajorDrawComparisonResponse } from "@/types/metrics/MajorDrawComparison";

export interface UseMajorDrawComparisonParams {
  currentDrawId: string;
  previousDrawId: string;
  enabled?: boolean;
}

export function useMajorDrawComparison({
  currentDrawId,
  previousDrawId,
  enabled = true,
}: UseMajorDrawComparisonParams) {
  return useQuery({
    queryKey: ["admin", "metrics", "major-draw-comparison", currentDrawId, previousDrawId],
    queryFn: async () => {
      const params = new URLSearchParams({
        currentDrawId,
        previousDrawId,
      });
      const response = await apiGet<{ data: MajorDrawComparisonResponse["data"]; meta: unknown }>(
        `/api/admin/metrics/major-draw-comparison?${params}`
      );
      return response.data;
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false,
    enabled: enabled && !!currentDrawId && !!previousDrawId,
  });
}

