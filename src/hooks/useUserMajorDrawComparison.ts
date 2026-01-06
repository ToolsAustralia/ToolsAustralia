/**
 * Hook for fetching user major draw comparison data
 */

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/queries";
import type { UserMajorDrawComparisonData } from "@/services/metrics/UserMajorDrawComparisonService";

export interface UseUserMajorDrawComparisonParams {
  currentDrawId: string;
  previousDrawId: string;
  enabled?: boolean;
}

export function useUserMajorDrawComparison({
  currentDrawId,
  previousDrawId,
  enabled = true,
}: UseUserMajorDrawComparisonParams) {
  return useQuery({
    queryKey: ["admin", "metrics", "users", "major-draw-comparison", currentDrawId, previousDrawId],
    queryFn: async () => {
      const params = new URLSearchParams({
        currentDrawId,
        previousDrawId,
      });
      const response = await apiGet<{ data: UserMajorDrawComparisonData; meta: unknown }>(
        `/api/admin/metrics/users/major-draw-comparison?${params}`
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


