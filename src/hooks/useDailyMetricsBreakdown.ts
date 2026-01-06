/**
 * Hook for fetching daily metrics breakdown items
 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet } from "@/lib/queries";
import type { BreakdownItem } from "@/components/admin/metrics/DailyMetricsBreakdownTable";

export interface UseDailyMetricsBreakdownParams {
  startDate: Date;
  endDate: Date;
  level: "campaign" | "adset" | "ad";
  campaignId?: string;
  adsetId?: string;
  enabled?: boolean;
}

export function useDailyMetricsBreakdown({
  startDate,
  endDate,
  level,
  campaignId,
  adsetId,
  enabled = true,
}: UseDailyMetricsBreakdownParams) {
  return useQuery({
    queryKey: queryKeys.admin.metrics.daily({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      level,
      breakdownId: campaignId || adsetId || "",
    }),
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        level,
      });
      if (campaignId) {
        params.append("campaignId", campaignId);
      }
      if (adsetId) {
        params.append("adsetId", adsetId);
      }
      const response = await apiGet<{ data: BreakdownItem[]; meta: unknown }>(
        `/api/admin/metrics/daily/breakdown?${params}`
      );
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false,
    enabled: enabled && !!startDate && !!endDate && !!level,
  });
}


