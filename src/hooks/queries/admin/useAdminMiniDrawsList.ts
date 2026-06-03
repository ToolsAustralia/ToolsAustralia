"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/queries";

export interface AdminMiniDrawListItem {
  _id: string;
  name: string;
  status: "active" | "completed" | "cancelled";
  prize: {
    name?: string;
    images?: string[];
  };
  displayOrder?: number;
  cycle?: number;
}

type ListResponse = {
  success: true;
  data: {
    miniDraws: AdminMiniDrawListItem[];
    pagination: { total: number };
  };
};

export function useAdminMiniDrawsList(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "mini-draw", "list", "all"],
    queryFn: async () => {
      const res = await apiGet<ListResponse>(
        "/api/admin/mini-draw/list?limit=100&sortBy=createdAt&sortOrder=desc"
      );
      return res.data.miniDraws;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** A ranked active mini draw for the Overview "Top mini draws" card. */
export interface TopMiniDrawItem {
  _id: string;
  name: string;
  status: "active" | "completed" | "cancelled";
  totalEntries: number;
  minimumEntries: number;
}

type TopListResponse = {
  success: true;
  data: {
    miniDraws: TopMiniDrawItem[];
    pagination: { total: number };
  };
};

/**
 * Active mini draws for the Overview "Top mini draws" card. Fetches the full
 * active pool (the route has no fill-ratio sort key) so the card can rank by
 * progress (entries ÷ capacity — "closest to drawing") rather than raw entries.
 * `poolLimit` caps the pool; active draws are few, so 50 covers them. Per-draw
 * revenue is not derivable (no priced tickets / no `miniDrawId` on PaymentEvent),
 * so the card shows name / capacity / entries / fill only.
 */
export function useTopMiniDraws(poolLimit = 50) {
  return useQuery({
    queryKey: ["admin", "mini-draw", "top", "active-pool", poolLimit],
    queryFn: async () => {
      const res = await apiGet<TopListResponse>(
        `/api/admin/mini-draw/list?status=active&sortBy=totalEntries&sortOrder=desc&limit=${poolLimit}`
      );
      return res.data.miniDraws;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
