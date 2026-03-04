import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { PageDetailResult } from "@/types/promo-analytics";

async function fetchPageDetail(
  pageType: string,
  slug: string,
  startDate: string,
  endDate: string
): Promise<PageDetailResult> {
  const params = new URLSearchParams({ pageType, slug, startDate, endDate });
  const res = await fetch(`/api/admin/promo-analytics/page-detail?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch page detail analytics");
  const json = await res.json();
  if (!json.success || !json.data) throw new Error(json.error || "Failed to load");
  return json.data;
}

export function usePromoPageDetail(
  pageType: string | null,
  slug: string | null,
  startDate: string,
  endDate: string
) {
  return useQuery({
    queryKey: queryKeys.admin.promoPageDetail(pageType ?? "", slug ?? "", startDate, endDate),
    queryFn: () => fetchPageDetail(pageType!, slug!, startDate, endDate),
    enabled: !!pageType && !!slug && !!startDate && !!endDate,
  });
}
