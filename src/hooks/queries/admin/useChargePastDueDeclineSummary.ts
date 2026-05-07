import { useQuery } from "@tanstack/react-query";
import type { DeclineCodeSummary } from "@/services/admin/chargePastDueHistory";

export type { DeclineCodeSummary } from "@/services/admin/chargePastDueHistory";

export interface DeclineSummaryFilter {
  startDate?: string;
  endDate?: string;
}

export interface UseChargePastDueDeclineSummaryResult {
  data: DeclineCodeSummary | undefined;
  isLoading: boolean;
  isError: boolean;
}

function buildQueryString(filter: DeclineSummaryFilter): string {
  const params = new URLSearchParams();
  if (filter.startDate) params.set("startDate", filter.startDate);
  if (filter.endDate) params.set("endDate", filter.endDate);
  return params.toString();
}

export function useChargePastDueDeclineSummary(
  filter: DeclineSummaryFilter
): UseChargePastDueDeclineSummaryResult {
  const query = useQuery<DeclineCodeSummary>({
    queryKey: ["admin", "charge-past-due", "decline-summary", filter],
    queryFn: async () => {
      const qs = buildQueryString(filter);
      const url = qs
        ? `/api/admin/charge-past-due/decline-summary?${qs}`
        : `/api/admin/charge-past-due/decline-summary`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load decline summary (${res.status})`);
      return res.json();
    },
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
