import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export interface SpendByUrlFocusTotals {
  spend: number;
  spendCents: number;
  revenue: number;
  revenueCents: number;
  conversions: number;
  roas: number;
}

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
  /** membership vs one-time split; absent = pre-split data or unknown:// row */
  packagesFocus?: { membership: SpendByUrlFocusTotals; "one-time": SpendByUrlFocusTotals };
}

/** Which ad platform a spend-by-URL query is scoped to. One platform per query. */
export type SpendByUrlPlatform = "meta" | "tiktok";

export interface SpendByUrlResponse {
  success: boolean;
  platform?: SpendByUrlPlatform;
  meta: {
    startDate: string;
    endDate: string;
    currency: string;
    adAccountId: string;
  };
  rows: SpendByUrlRow[];
}

/**
 * Spend-by-URL rows for ONE platform (default meta).
 *
 * Each platform's `revenue` is its OWN attributed value, so callers wanting a company-wide
 * view must sum spend (additive and safe) while keeping revenue per platform — the same
 * purchase can be claimed by Meta and TikTok, and adding those together inflates ROAS.
 * `options.enabled` lets a caller hold a platform's query back until it's known to be
 * configured, so an unconfigured platform doesn't surface as an error banner.
 */
export function useSpendByUrlAnalytics(
  startDate: string | undefined,
  endDate: string | undefined,
  options?: { platform?: SpendByUrlPlatform; enabled?: boolean }
) {
  const platform = options?.platform ?? "meta";
  return useQuery<SpendByUrlResponse>({
    queryKey: ["admin", "analytics", "spend-by-url", platform, startDate, endDate],
    enabled: options?.enabled !== false && Boolean(startDate && endDate),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      params.set("platform", platform);
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
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adsetName?: string;
  /** Landing-URL strategy of this ad; "unclassified" = destination unresolved */
  packagesFocus: "membership" | "one-time" | "unclassified";
  /** The canonical landing URL this ad points at. Undefined when the destination is unresolved. */
  canonicalUrl?: string;
  /**
   * Every URL on this ad's creative, unmodified (query strings intact) — unlike `canonicalUrl`,
   * which is origin+path only. The ad-URL mismatch check (`src/utils/admin/adUrlMismatchCheck.ts`)
   * reads this field, never `canonicalUrl`, because a `?toolbox=`/`?toolset=` selection is
   * invisible on the canonical form. Multiple entries = a carousel/multi-URL ad. Undefined when
   * the destination is unresolved.
   */
  rawUrls?: string[];
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
  endDate: string | undefined,
  options?: { platform?: SpendByUrlPlatform }
) {
  const platform = options?.platform ?? "meta";
  return useQuery<SpendByUrlDetailResponse>({
    queryKey: [
      "admin", "analytics", "spend-by-url", "detail", platform, canonicalUrl, startDate, endDate,
    ],
    enabled: Boolean(canonicalUrl && startDate && endDate),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("canonicalUrl", canonicalUrl!);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      params.set("platform", platform);
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
  options?: { enabled?: boolean; platform?: SpendByUrlPlatform }
) {
  const platform = options?.platform ?? "meta";
  const fingerprint = useMemo(
    () => (canonicalUrls?.length ? detailQueryKeyFingerprint(canonicalUrls) : ""),
    [canonicalUrls]
  );

  const enabled =
    options?.enabled !== false &&
    Boolean(fingerprint && startDate && endDate && canonicalUrls && canonicalUrls.length > 0);

  return useQuery<SpendByUrlDetailResponse>({
    queryKey: [
      "admin", "analytics", "spend-by-url", "detail", "many", platform, fingerprint, startDate, endDate,
    ],
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const u of canonicalUrls!) {
        params.append("canonicalUrl", u);
      }
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      params.set("platform", platform);
      const res = await fetch(`/api/admin/analytics/spend-by-url/detail?${params.toString()}`);
      const json = (await res.json()) as SpendByUrlDetailResponse & { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Failed to load detail");
      }
      return json;
    },
  });
}
