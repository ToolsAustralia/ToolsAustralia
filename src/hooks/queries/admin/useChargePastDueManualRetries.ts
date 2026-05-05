import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { RunDetailRowDTO } from "./useChargePastDueRunDetail";
import type { IInvoiceChargeLog } from "@/models/InvoiceChargeLog";

export interface ManualRetriesFilter {
  startDate?: string;
  endDate?: string;
  adminId?: string;
  status?: IInvoiceChargeLog["status"];
}

export interface ManualRetryRowDTO extends RunDetailRowDTO {
  adminId: string;
  adminName: string;
}

export interface ManualRetriesResponse {
  rows: ManualRetryRowDTO[];
  total: number;
}

export interface UseChargePastDueManualRetriesResult {
  rows: ManualRetryRowDTO[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isError: boolean;
  fetchNextPage: () => void;
}

const PAGE_SIZE = 50;
const EMPTY_ROWS: ManualRetryRowDTO[] = [];

function buildQueryString(filter: ManualRetriesFilter, offset: number): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  return params.toString();
}

export function useChargePastDueManualRetries(
  filter: ManualRetriesFilter
): UseChargePastDueManualRetriesResult {
  const query = useInfiniteQuery<ManualRetriesResponse>({
    queryKey: ["admin", "charge-past-due", "manual-retries", filter],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const offset = (pageParam as number) ?? 0;
      const qs = buildQueryString(filter, offset);
      const res = await fetch(`/api/admin/charge-past-due/manual-retries?${qs}`);
      if (!res.ok) throw new Error(`Failed to load manual retries (${res.status})`);
      return res.json();
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.rows.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });

  const rows = useMemo(
    () => query.data?.pages.flatMap((p) => p.rows) ?? EMPTY_ROWS,
    [query.data]
  );
  const total = query.data?.pages[0]?.total ?? 0;

  return {
    rows,
    total,
    hasMore: !!query.hasNextPage,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    isError: query.isError,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
  };
}
