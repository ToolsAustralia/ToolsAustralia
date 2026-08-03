import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { ChannelDetailResult } from "@/types/promo-analytics";
import type { ConvertingPlatform } from "@/types/attribution";

/**
 * Channel drill-down.
 *
 * The route takes a canonical channel KEY (`meta`, `klaviyo_email`, …), not a raw `utm_source`:
 * the enum is closed server-side, which is what removed the regex built from a visitor-supplied
 * query value. Callers must pass `row.channel`, never `row.channelLabel`.
 */
async function fetchChannelDetail(
  channel: ConvertingPlatform,
  startDate: string,
  endDate: string
): Promise<ChannelDetailResult> {
  const params = new URLSearchParams({ channel, startDate, endDate });
  const res = await fetch(`/api/admin/promo-analytics/channel-detail?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch channel detail analytics");
  const json = await res.json();
  if (!json.success || !json.data) throw new Error(json.error || "Failed to load");
  return json.data;
}

export function useChannelDetail(
  channel: ConvertingPlatform | null,
  startDate: string,
  endDate: string
) {
  return useQuery({
    queryKey: queryKeys.admin.promoChannelDetail(channel ?? "", startDate, endDate),
    queryFn: () => fetchChannelDetail(channel!, startDate, endDate),
    enabled: !!channel && !!startDate && !!endDate,
  });
}
