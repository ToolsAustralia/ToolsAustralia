"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/queries";

export interface AdminMajorDrawListItem {
  _id: string;
  name: string;
  status: "queued" | "active" | "frozen" | "completed" | "cancelled";
  prize: {
    name?: string;
    images?: string[];
  } | null;
  drawDate?: string;
}

type HistoryResponse = {
  success: true;
  data: {
    draws: AdminMajorDrawListItem[];
    pagination: { totalCount: number };
  };
};

export function useAdminMajorDrawsList(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "major-draw", "list", "all"],
    queryFn: async () => {
      const res = await apiGet<HistoryResponse>(
        "/api/admin/major-draw/history?limit=100&sortBy=drawDate&sortOrder=desc"
      );
      return res.data.draws;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
