import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export interface SpendByUrlRow {
  canonicalUrl: string;
  spend: number;
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  revenueCents: number;
  cpc: number;
  roas: number;
  adIds: string[];
}

export interface SpendByUrlResponse {
  success: boolean;
  meta: {
    startDate: string;
    endDate: string;
    currency: string;
    adAccountId: string;
  };
  rows: SpendByUrlRow[];
}

export function useSpendByUrlAnalytics(startDate: string | undefined, endDate: string | undefined) {
  return useQuery<SpendByUrlResponse>({
    queryKey: ["admin", "analytics", "spend-by-url", startDate, endDate],
    enabled: Boolean(startDate && endDate),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/admin/analytics/spend-by-url?${params.toString()}`);
      const json = (await res.json()) as SpendByUrlResponse & { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Failed to load spend by URL");
      }
      return json;
    },
  });
}

export interface SpendByUrlDetailRow {
  adId: string;
  adName?: string;
  spend: number;
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  revenueCents: number;
  cpc: number;
  roas: number;
  /** From Meta creative shape at last sync */
  adFormat: "video" | "static" | "carousel" | "unknown";
}

export interface SpendByUrlDetailResponse {
  success: boolean;
  rows: SpendByUrlDetailRow[];
  meta?: {
    canonicalUrl?: string;
    canonicalUrls?: string[];
    startDate?: string;
    endDate?: string;
    currency?: string;
    adAccountId?: string;
  };
}

function detailQueryKeyFingerprint(canonicalUrls: string[]): string {
  return [...new Set(canonicalUrls.map((u) => u.trim()).filter(Boolean))].sort().join("\n");
}

export function useSpendByUrlDetail(
  canonicalUrl: string | null,
  startDate: string | undefined,
  endDate: string | undefined
) {
  return useQuery<SpendByUrlDetailResponse>({
    queryKey: ["admin", "analytics", "spend-by-url", "detail", canonicalUrl, startDate, endDate],
    enabled: Boolean(canonicalUrl && startDate && endDate),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("canonicalUrl", canonicalUrl!);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/admin/analytics/spend-by-url/detail?${params.toString()}`);
      const json = (await res.json()) as SpendByUrlDetailResponse & { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Failed to load detail");
      }
      return json;
    },
  });
}

export function useSpendByUrlDetailMany(
  canonicalUrls: string[] | null | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
  options?: { enabled?: boolean }
) {
  const fingerprint = useMemo(
    () => (canonicalUrls?.length ? detailQueryKeyFingerprint(canonicalUrls) : ""),
    [canonicalUrls]
  );

  const enabled =
    options?.enabled !== false &&
    Boolean(fingerprint && startDate && endDate && canonicalUrls && canonicalUrls.length > 0);

  return useQuery<SpendByUrlDetailResponse>({
    queryKey: ["admin", "analytics", "spend-by-url", "detail", "many", fingerprint, startDate, endDate],
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const u of canonicalUrls!) {
        params.append("canonicalUrl", u);
      }
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/admin/analytics/spend-by-url/detail?${params.toString()}`);
      const json = (await res.json()) as SpendByUrlDetailResponse & { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Failed to load detail");
      }
      return json;
    },
  });
}
