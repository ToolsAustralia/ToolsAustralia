"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface FacebookAdsHealthQueryArgs {
  startDate: string;
  endDate: string;
  level: "campaign" | "adset" | "ad";
  // ALL row-level filters (verdict, learningStatus, liveOnly, minSpend, search, campaign)
  // are applied client-side via useMemo in FacebookAdsHealthView. They MUST NOT appear
  // here or in queryKey — doing so defeats TanStack Query caching on every filter toggle
  // AND breaks the campaign multiselect UI (which needs the full campaign list, not just
  // the filtered subset, to let users switch campaigns without clearing first).
}

function buildUrl(args: FacebookAdsHealthQueryArgs): string {
  const p = new URLSearchParams();
  p.set("startDate", args.startDate);
  p.set("endDate", args.endDate);
  p.set("level", args.level);
  return `/api/admin/facebook-ads/health/insights?${p}`;
}

export function useFacebookAdsHealth(args: FacebookAdsHealthQueryArgs) {
  return useQuery({
    // queryKey intentionally omits ALL filter values. The unfiltered row set is
    // cached and FacebookAdsHealthView filters it locally with useMemo.
    queryKey: ["facebookAdsHealth", "insights", { startDate: args.startDate, endDate: args.endDate, level: args.level }],
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
