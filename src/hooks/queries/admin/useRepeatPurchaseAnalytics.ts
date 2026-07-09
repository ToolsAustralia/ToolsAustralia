import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type {
  RepeatPurchaseSummary,
  RepeatPurchaseUserRow,
  RepeatPurchaseUsersResult,
  RepeatBucketKey,
  RepeatMemberFilter,
  RepeatSegment,
} from "@/types/admin/repeatPurchase";

export interface RepeatPurchaseFilter {
  /** AEST yyyy-MM-dd (inclusive). */
  startDate?: string;
  endDate?: string;
}

export function useRepeatPurchaseSummary(filter: RepeatPurchaseFilter = {}) {
  return useQuery<RepeatPurchaseSummary>({
    queryKey: ["admin", "analytics", "repeat-purchases", "summary", filter],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter.startDate) params.set("startDate", filter.startDate);
      if (filter.endDate) params.set("endDate", filter.endDate);
      const qs = params.toString();
      const res = await fetch(`/api/admin/analytics/repeat-purchases${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(`Failed to load repeat-purchase summary (${res.status})`);
      const json = (await res.json()) as { success: boolean; data: RepeatPurchaseSummary; error?: string };
      if (!json.success) throw new Error(json.error ?? "Request failed");
      return json.data;
    },
  });
}

export interface RepeatPurchaseUsersFilter extends RepeatPurchaseFilter {
  segment: RepeatSegment;
  bucket?: RepeatBucketKey;
  member?: RepeatMemberFilter;
  limit?: number;
}

const USERS_PAGE_SIZE = 50;

export interface UseRepeatPurchaseUsersResult {
  rows: RepeatPurchaseUserRow[];
  totalCount: number;
  hasMore: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Paginated cohort list with "Load more" accumulation (offset pages, mirrors
 * useChargePastDueRuns). Returns a flattened facade over the infinite query.
 */
export function useRepeatPurchaseUsers(
  filter: RepeatPurchaseUsersFilter,
  options: { enabled?: boolean } = {}
): UseRepeatPurchaseUsersResult {
  const limit = filter.limit ?? USERS_PAGE_SIZE;
  const query = useInfiniteQuery<RepeatPurchaseUsersResult>({
    queryKey: ["admin", "analytics", "repeat-purchases", "users", { ...filter, limit }],
    enabled: options.enabled ?? true,
    staleTime: 2 * 60 * 1000,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ segment: filter.segment, page: String(pageParam), limit: String(limit) });
      if (filter.bucket) params.set("bucket", filter.bucket);
      if (filter.member && filter.member !== "all") params.set("member", filter.member);
      if (filter.startDate) params.set("startDate", filter.startDate);
      if (filter.endDate) params.set("endDate", filter.endDate);
      const res = await fetch(`/api/admin/analytics/repeat-purchases/users?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load repeat-purchase users (${res.status})`);
      const json = (await res.json()) as { success: boolean; data: RepeatPurchaseUsersResult; error?: string };
      if (!json.success) throw new Error(json.error ?? "Request failed");
      return json.data;
    },
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.page * lastPage.limit;
      return loaded < lastPage.totalCount ? lastPage.page + 1 : undefined;
    },
  });

  const rows = query.data?.pages.flatMap((p) => p.rows) ?? [];
  const totalCount = query.data?.pages[0]?.totalCount ?? 0;

  return {
    rows,
    totalCount,
    hasMore: !!query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
