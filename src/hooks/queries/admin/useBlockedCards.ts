"use client";

// Queries the `/api/admin/allowlist/blocked-cards` API which underpins the
// "Blocked Transactions" admin tab. The hook keeps its `Cards` naming because
// it mirrors the API endpoint path; the user-facing label is "Transactions".
//
// Phase C: this hook now reads the Mongo-backed cursor-paginated path
// (`?source=mongo`) via `useInfiniteQuery`. The route still defaults to
// `stripe` for any other caller / debugging, but this hook — the only
// consumer that matters for the admin UI — explicitly opts into Mongo.

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet } from "@/lib/queries";
import type { BlockedRow, BlockedFilter } from "@/services/allowlist/types";

const DEFAULT_PAGE_SIZE = 50;

// Stable empty array reference so consuming `useMemo`s downstream (e.g.
// `eligibleRows`, `stats` in BlockedTransactionsManagement) don't invalidate
// every render while the query is still loading.
const EMPTY_ROWS: BlockedRow[] = [];

type MongoPageResponse = {
  success: true;
  rows: BlockedRow[];
  nextCursor: string | null;
  total: number;
};

/** Filter-only key (excludes cursor — cursor is a pageParam, not part of the query key). */
function buildFilterKey(filter: BlockedFilter): string {
  const params = new URLSearchParams({
    dateFrom: filter.dateFrom.toISOString(),
    dateTo: filter.dateTo.toISOString(),
    memberStatus: filter.memberStatus,
    declineReason: filter.declineReason,
    skippedOnly: String(filter.skippedOnly),
  });
  return params.toString();
}

/** Full request URL for a given page (filter + pagination). */
function buildPageQueryString(filter: BlockedFilter, cursor: string | null): string {
  const params = new URLSearchParams({
    source: "mongo",
    dateFrom: filter.dateFrom.toISOString(),
    dateTo: filter.dateTo.toISOString(),
    memberStatus: filter.memberStatus,
    declineReason: filter.declineReason,
    skippedOnly: String(filter.skippedOnly),
    limit: String(DEFAULT_PAGE_SIZE),
  });
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

export type UseBlockedCardsResult = {
  /** Flattened rows from all pages currently loaded. Stable empty array when no data. */
  rows: BlockedRow[];
  /** Total count matching the filter (across all pages). 0 until first page loads. */
  total: number;
  /** True when more pages remain on the server. */
  hasMore: boolean;
  /** Initial-load flag — first page never fetched. */
  isLoading: boolean;
  /** Any fetch is in flight (initial OR next page OR refetch). */
  isFetching: boolean;
  /** Specifically: the next-page fetch is in flight. */
  isFetchingNextPage: boolean;
  /** Trigger the next page load. No-op if hasMore is false. */
  fetchNextPage: () => void;
  /** Re-fetch from page 1. Resets accumulated pages. */
  refetch: () => void;
  /** Error state (Error OR null). */
  error: Error | null;
};

export function useBlockedCards(filter: BlockedFilter): UseBlockedCardsResult {
  const filterKey = buildFilterKey(filter);

  const query = useInfiniteQuery({
    queryKey: queryKeys.admin.allowlist.blockedCards(filterKey),
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      const qs = buildPageQueryString(filter, pageParam);
      return await apiGet<MongoPageResponse>(`/api/admin/allowlist/blocked-cards?${qs}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });

  const rows = useMemo(
    () => query.data?.pages.flatMap((p) => p.rows) ?? EMPTY_ROWS,
    [query.data]
  );
  const total = query.data?.pages[0]?.total ?? 0;
  const hasMore = !!query.hasNextPage;

  return {
    rows,
    total,
    hasMore,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    refetch: () => {
      void query.refetch();
    },
    error: (query.error as Error | null) ?? null,
  };
}
