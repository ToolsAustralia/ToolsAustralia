import { useQuery } from "@tanstack/react-query";

export type HourlyRevenuePlatform = "meta" | "tiktok" | "snapchat" | "klaviyo" | "all";

export interface HourlyRevenueBucket {
  hour: number;
  revenue: number;
  conversions: number;
}

export interface HourlyRevenueData {
  hourly: HourlyRevenueBucket[];
  totalRevenue: number;
  totalConversions: number;
  platform: HourlyRevenuePlatform;
  dateRange: { start: string; end: string };
}

/**
 * Hour-of-day (Australia/Sydney) server-side attributed revenue + conversions for one
 * platform (or "klaviyo" = email+sms, "all" = every channel). Source: SHARED-1
 * (GET /api/admin/analytics/hourly-revenue).
 */
export function useHourlyRevenue(params: {
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  platform: HourlyRevenuePlatform;
  enabled?: boolean;
}) {
  const { startDate, endDate, platform, enabled = true } = params;

  return useQuery<HourlyRevenueData>({
    queryKey: ["admin", "analytics", "hourly-revenue", platform, startDate, endDate],
    enabled: enabled && !!startDate && !!endDate,
    queryFn: async (): Promise<HourlyRevenueData> => {
      if (!startDate || !endDate) throw new Error("startDate and endDate are required");
      const sp = new URLSearchParams({ startDate, endDate, platform });
      const res = await fetch(`/api/admin/analytics/hourly-revenue?${sp.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || err.details || `Failed to fetch hourly revenue: ${res.statusText}`);
      }
      const json = await res.json();
      if (!json.success || !json.data) throw new Error(json.error || "No data returned");
      return json.data as HourlyRevenueData;
    },
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 2 * 60 * 1000,
    retry: 2,
    retryDelay: (i) => Math.min(1000 * 2 ** i, 30000),
  });
}
