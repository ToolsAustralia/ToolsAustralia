"use client";

// Queries the `/api/admin/allowlist/blocked-cards` API which underpins the
// "Blocked Transactions" admin tab. The hook keeps its `Cards` naming because
// it mirrors the API endpoint path; the user-facing label is "Transactions".

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet } from "@/lib/queries";
import type { BlockedRow, BlockedFilter } from "@/services/allowlist/types";

export type BlockedCardsResponse = {
  success: true;
  rows: BlockedRow[];
  truncated: boolean;
  scanned: number;
};

export type BlockedCardsResult = {
  rows: BlockedRow[];
  truncated: boolean;
  scanned: number;
};

function buildQueryString(filter: BlockedFilter): string {
  const params = new URLSearchParams({
    dateFrom: filter.dateFrom.toISOString(),
    dateTo: filter.dateTo.toISOString(),
    memberStatus: filter.memberStatus,
    declineReason: filter.declineReason,
    skippedOnly: String(filter.skippedOnly),
  });
  return params.toString();
}

export function useBlockedCards(filter: BlockedFilter) {
  const filterKey = buildQueryString(filter);
  return useQuery<BlockedCardsResult>({
    queryKey: queryKeys.admin.allowlist.blockedCards(filterKey),
    queryFn: async () => {
      const data = await apiGet<BlockedCardsResponse>(`/api/admin/allowlist/blocked-cards?${filterKey}`);
      return { rows: data.rows, truncated: data.truncated, scanned: data.scanned };
    },
    staleTime: 30_000,
  });
}
