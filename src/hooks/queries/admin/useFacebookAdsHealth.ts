"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface FacebookAdsHealthQueryArgs {
  startDate: string;
  endDate: string;
  level: "campaign" | "adset" | "ad";
  verdict?: string[];
  learningStatus?: string[];
  minSpend?: number;
  campaign?: string[];
  search?: string;
}

function buildUrl(args: FacebookAdsHealthQueryArgs): string {
  const p = new URLSearchParams();
  p.set("startDate", args.startDate);
  p.set("endDate", args.endDate);
  p.set("level", args.level);
  if (args.verdict?.length) p.set("verdict", args.verdict.join(","));
  if (args.learningStatus?.length) p.set("learningStatus", args.learningStatus.join(","));
  if (args.minSpend !== undefined) p.set("minSpend", String(args.minSpend));
  if (args.campaign?.length) p.set("campaign", args.campaign.join(","));
  if (args.search) p.set("search", args.search);
  return `/api/admin/facebook-ads/health/insights?${p}`;
}

export function useFacebookAdsHealth(args: FacebookAdsHealthQueryArgs) {
  return useQuery({
    queryKey: ["facebookAdsHealth", "insights", args],
    queryFn: async () => {
      const r = await fetch(buildUrl(args));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 60_000,
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
