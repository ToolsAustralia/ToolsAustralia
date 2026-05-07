"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet } from "@/lib/queries";

type StatsResponse = {
  success: true;
  totalActiveAllowlisted: number;
};

/**
 * Drives the "Total on allowlist" metric card on /admin/blocked-transactions.
 * 60s staleTime — the value only moves on apply / reverse, both of which
 * invalidate this key.
 */
export function useAllowlistStats() {
  return useQuery({
    queryKey: queryKeys.admin.allowlist.stats(),
    queryFn: async () => apiGet<StatsResponse>("/api/admin/allowlist/stats"),
    staleTime: 60_000,
  });
}
