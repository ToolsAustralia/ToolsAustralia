"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface FacebookAdsHealthQueryArgs {
  startDate: string;
  endDate: string;
  level: "campaign" | "adset" | "ad";
  // verdict, learningStatus, minSpend, search are applied client-side (useMemo in FacebookAdsHealthView).
  // They must NOT appear here or in queryKey — doing so defeats TanStack Query caching on every filter toggle.
  campaign?: string[];
}

function buildUrl(args: FacebookAdsHealthQueryArgs): string {
  const p = new URLSearchParams();
  p.set("startDate", args.startDate);
  p.set("endDate", args.endDate);
  p.set("level", args.level);
  if (args.campaign?.length) p.set("campaign", args.campaign.join(","));
  return `/api/admin/facebook-ads/health/insights?${p}`;
}

export function useFacebookAdsHealth(args: FacebookAdsHealthQueryArgs) {
  return useQuery({
    // queryKey intentionally omits client-side filter values (verdict / status / spend / search).
    // The unfiltered row set is cached; FacebookAdsHealthView filters it locally with useMemo.
    queryKey: ["facebookAdsHealth", "insights", { startDate: args.startDate, endDate: args.endDate, level: args.level, campaign: args.campaign }],
    queryFn: async () => {
      const r = await fetch(buildUrl(args));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    enabled: !!args.startDate && !!args.endDate,
  });
}

export function useFacebookAdsHealthSnooze() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { adId: string; hours: number; reason?: string }) => {
      const r = await fetch("/api/admin/facebook-ads/health/snooze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, verdict: "investigate" }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["facebookAdsHealth", "insights"] }),
  });
}

export function useFacebookAdsHealthSettings() {
  return useQuery({
    queryKey: ["facebookAdsHealth", "settings"],
    queryFn: async () => {
      const r = await fetch("/api/admin/facebook-ads/health/settings");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 5 * 60_000,
  });
}

export function useFacebookAdsHealthSettingsUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, number>) => {
      const r = await fetch("/api/admin/facebook-ads/health/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["facebookAdsHealth"] });
    },
  });
}
