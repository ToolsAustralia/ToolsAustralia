import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { ChargeJobRunStatus, IChargeJobRun } from "@/models/ChargeJobRun";

export interface RunsFilter {
  startDate?: string;
  endDate?: string;
  adminId?: string;
  status?: ChargeJobRunStatus;
}

export interface ListedRunDTO {
  _id: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  adminId: string;
  adminName: string;
  status: ChargeJobRunStatus;
  /** "charge" = past-due bulk charge; "recover" = stranded-invoice recovery. Legacy runs ⇒ "charge". */
  kind: IChargeJobRun["kind"];
  totals: IChargeJobRun["totals"];
}

export interface RunsResponse {
  runs: ListedRunDTO[];
  total: number;
}

export interface UseChargePastDueRunsResult {
  runs: ListedRunDTO[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isError: boolean;
  fetchNextPage: () => void;
}

const PAGE_SIZE = 50;
const EMPTY_RUNS: ListedRunDTO[] = [];

function buildQueryString(filter: RunsFilter, offset: number): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  return params.toString();
}

export function useChargePastDueRuns(filter: RunsFilter): UseChargePastDueRunsResult {
  const query = useInfiniteQuery<RunsResponse>({
    queryKey: ["admin", "charge-past-due", "runs", filter],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const offset = (pageParam as number) ?? 0;
      const qs = buildQueryString(filter, offset);
      const res = await fetch(`/api/admin/charge-past-due/runs?${qs}`);
      if (!res.ok) throw new Error(`Failed to load runs (${res.status})`);
      return res.json();
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.runs.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });

  const runs = useMemo(
    () => query.data?.pages.flatMap((p) => p.runs) ?? EMPTY_RUNS,
    [query.data]
  );
  const total = query.data?.pages[0]?.total ?? 0;

  return {
    runs,
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
