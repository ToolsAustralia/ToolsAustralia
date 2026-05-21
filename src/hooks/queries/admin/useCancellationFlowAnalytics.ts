import { useQuery } from "@tanstack/react-query";
import type { CancellationFlowSummary } from "@/services/admin/cancellationFlowAnalytics";

export type { CancellationFlowSummary } from "@/services/admin/cancellationFlowAnalytics";

export interface CancellationFlowAnalyticsFilter {
  /** AEST yyyy-MM-dd (inclusive lower bound on startedAt). */
  startDate?: string;
  /** AEST yyyy-MM-dd (inclusive upper bound on startedAt; server adds +1 day). */
  endDate?: string;
}

export interface UseCancellationFlowAnalyticsResult {
  data: CancellationFlowSummary | undefined;
  isLoading: boolean;
  isError: boolean;
}

function buildQueryString(filter: CancellationFlowAnalyticsFilter): string {
  const params = new URLSearchParams();
  if (filter.startDate) params.set("startDate", filter.startDate);
  if (filter.endDate) params.set("endDate", filter.endDate);
  return params.toString();
}

export function useCancellationFlowAnalytics(
  filter: CancellationFlowAnalyticsFilter = {}
): UseCancellationFlowAnalyticsResult {
  const query = useQuery<CancellationFlowSummary>({
    queryKey: ["admin", "cancellation-flow-analytics", filter],
    queryFn: async () => {
      const qs = buildQueryString(filter);
      const url = qs
        ? `/api/admin/cancellation-flow-analytics?${qs}`
        : `/api/admin/cancellation-flow-analytics`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load cancellation-flow analytics (${res.status})`);
      const json = (await res.json()) as { data: CancellationFlowSummary };
      return json.data;
    },
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
