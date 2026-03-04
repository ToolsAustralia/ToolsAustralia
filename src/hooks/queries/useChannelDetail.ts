import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { ChannelDetailResult } from "@/types/promo-analytics";

async function fetchChannelDetail(
  utmSource: string,
  startDate: string,
  endDate: string
): Promise<ChannelDetailResult> {
  const params = new URLSearchParams({ utmSource, startDate, endDate });
  const res = await fetch(`/api/admin/promo-analytics/channel-detail?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch channel detail analytics");
  const json = await res.json();
  if (!json.success || !json.data) throw new Error(json.error || "Failed to load");
  return json.data;
}

export function useChannelDetail(
  utmSource: string | null,
  startDate: string,
  endDate: string
) {
  return useQuery({
    queryKey: queryKeys.admin.promoChannelDetail(utmSource ?? "", startDate, endDate),
    queryFn: () => fetchChannelDetail(utmSource!, startDate, endDate),
    enabled: !!utmSource && !!startDate && !!endDate,
  });
}
