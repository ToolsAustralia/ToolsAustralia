import { useQuery } from "@tanstack/react-query";
import type { CancellationFlowSummary } from "@/services/admin/cancellationFlowAnalytics";

export type { CancellationFlowSummary } from "@/services/admin/cancellationFlowAnalytics";

export interface CancellationFlowAnalyticsFilter {
  /** ISO datetime string (inclusive lower bound on startedAt). */
  from?: string;
  /** ISO datetime string (exclusive upper bound on startedAt). */
  to?: string;
}

export interface UseCancellationFlowAnalyticsResult {
  data: CancellationFlowSummary | undefined;
  isLoading: boolean;
  isError: boolean;
}

function buildQueryString(filter: CancellationFlowAnalyticsFilter): string {
  const params = new URLSearchParams();
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
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
