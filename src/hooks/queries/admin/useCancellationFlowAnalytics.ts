import { useQuery } from "@tanstack/react-query";
import type {
  CancellationFlowSummary,
  ReasonUsersResult,
} from "@/services/admin/cancellationFlowAnalytics";
import type { CancellationReason } from "@/models/CancellationFlowEvent";

export type { CancellationFlowSummary, ReasonUsersResult } from "@/services/admin/cancellationFlowAnalytics";

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

export interface CancellationFlowUsersByReasonFilter {
  reason: CancellationReason;
  outcome?: "in_progress" | "saved" | "cancelled";
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export function useCancellationFlowUsersByReason(
  filter: CancellationFlowUsersByReasonFilter | null,
  options: { enabled?: boolean } = {}
) {
  const enabled = (options.enabled ?? true) && filter !== null;
  const query = useQuery<ReasonUsersResult>({
    queryKey: ["admin", "cancellation-flow-analytics", "users-by-reason", filter],
    enabled,
    queryFn: async () => {
      if (!filter) throw new Error("filter is required");
      const params = new URLSearchParams({ reason: filter.reason });
      if (filter.outcome) params.set("outcome", filter.outcome);
      if (filter.startDate) params.set("startDate", filter.startDate);
      if (filter.endDate) params.set("endDate", filter.endDate);
      if (filter.page) params.set("page", String(filter.page));
      if (filter.limit) params.set("limit", String(filter.limit));
      const res = await fetch(
        `/api/admin/cancellation-flow-analytics/users-by-reason?${params.toString()}`
      );
      if (!res.ok) throw new Error(`Failed to load reason users (${res.status})`);
      const json = (await res.json()) as { data: ReasonUsersResult };
      return json.data;
    },
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
