import { useQuery } from "@tanstack/react-query";

export interface PackagesFocusTotals {
  spend: number;
  spendCents: number;
  revenue: number;
  revenueCents: number;
  roas: number;
  conversions: number;
  impressions: number;
  clicks: number;
}

export interface PackagesFocusAdNode {
  adId: string;
  adName?: string;
  adFormat: "video" | "static" | "carousel" | "unknown";
  totals: PackagesFocusTotals;
  /** Landing-URL strategy of this ad; not emitted by the breakdown endpoint today — set by the prize modal's mixed-bucket tree */
  packagesFocus?: "membership" | "one-time" | "unclassified";
}

export interface PackagesFocusAdsetNode {
  adsetId: string;
  adsetName?: string;
  totals: PackagesFocusTotals;
  ads: PackagesFocusAdNode[];
}

export interface PackagesFocusCampaignNode {
  campaignId: string;
  campaignName?: string;
  totals: PackagesFocusTotals;
  adsets: PackagesFocusAdsetNode[];
}

export interface PackagesFocusBreakdownResponse {
  success: boolean;
  platform: "meta" | "tiktok";
  supported: boolean;
  reason?: "not-configured";
  meta: { startDate: string; endDate: string; currency: string; adAccountId: string };
  summary: {
    membership: PackagesFocusTotals;
    "one-time": PackagesFocusTotals;
    unclassified: PackagesFocusTotals;
    total: PackagesFocusTotals;
  };
  detail: {
    complete: boolean;
    /** Oldest insights date the account still retains (TTL floor); null = account has no insights at all */
    availableSince: string | null;
    buckets: {
      membership: PackagesFocusCampaignNode[];
      "one-time": PackagesFocusCampaignNode[];
      unclassified: PackagesFocusCampaignNode[];
    };
  };
}

export function usePackagesFocusBreakdown(
  platform: "meta" | "tiktok",
  startDate: string | undefined,
  endDate: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery<PackagesFocusBreakdownResponse>({
    queryKey: ["admin", "analytics", "packages-focus", platform, startDate, endDate],
    enabled: options?.enabled !== false && Boolean(startDate && endDate),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      params.set("platform", platform);
      const res = await fetch(`/api/admin/analytics/packages-focus?${params.toString()}`);
      const json = (await res.json()) as PackagesFocusBreakdownResponse & { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Failed to load packages-focus breakdown");
      }
      return json;
    },
  });
}
