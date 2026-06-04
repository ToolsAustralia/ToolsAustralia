import { useQuery } from "@tanstack/react-query";
import type { MerByDrawResponse } from "@/types/admin/mer";

/**
 * Marketing Efficiency Ratio table — one row per major draw.
 * Self-contained (no date params): the endpoint returns every MER-eligible draw,
 * most-recent first. See src/services/admin/mer/merByDrawService.ts.
 */
export function useMerByDraw() {
  return useQuery<MerByDrawResponse>({
    queryKey: ["admin", "analytics", "mer-by-draw"],
    queryFn: async () => {
      const res = await fetch("/api/admin/analytics/mer-by-draw");
      const json = (await res.json()) as MerByDrawResponse;
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load MER table");
      }
      return json;
    },
  });
}
