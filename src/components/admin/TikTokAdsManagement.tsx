"use client";

import React, { useState } from "react";
import PlatformHourlyRevenueSection from "@/components/admin/PlatformHourlyRevenueSection";
import TikTokAdBreakdownTable from "@/components/admin/TikTokAdBreakdownTable";
import SpendByUrlSection from "@/components/admin/SpendByUrlSection";
import { useAdminDateFilter } from "@/hooks/useAdminDateFilter";
import { AdminDateRangeToolbar } from "@/components/admin/AdminDateRangeToolbar";

type ViewMode = "ads" | "spend-by-url";

/**
 * TikTok Ads analytics, mirroring the Facebook Ads tab's Ads / Spend-by-URL split.
 *
 *  - **Ads** — server-side attributed revenue by hour (convertingPlatform === "tiktok")
 *    plus the per-ad breakdown from `TikTokAdInsightsDaily`.
 *  - **Spend by URL** — the SAME `SpendByUrlSection` the Facebook tab renders, passed
 *    `platform="tiktok"`. Sharing the component rather than forking it is deliberate: a fix
 *    to that table lands on both platforms, and the two can't drift into disagreeing about
 *    the same underlying rollup.
 *
 * There is no Health sub-view. Meta's verdict engine reads learning-phase state
 * (`learning_stage_info`, `last_significant_edit`) that TikTok's Marketing API does not
 * expose, so a TikTok "health" tab would either be missing its main signal or silently
 * invent one. Left out on purpose until the inputs exist — see docs/admin/frontend.md.
 */
export default function TikTokAdsManagement() {
  const df = useAdminDateFilter("today");
  const [viewMode, setViewMode] = useState<ViewMode>("ads");

  const tab = (mode: ViewMode, label: string) => (
    <button
      type="button"
      onClick={() => setViewMode(mode)}
      aria-pressed={viewMode === mode}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
        viewMode === mode
          ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white"
          : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-400 dark:border-neutral-700 dark:hover:bg-neutral-800"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* empty:hidden — the dropdown portals to the mobile header slot, leaving this
          wrapper childless on mobile; the variant collapses it so there's no phantom gap. */}
      <div className="flex flex-wrap items-center justify-between gap-2 empty:hidden">
        <div className="flex flex-wrap items-center gap-2">
          {tab("ads", "Ads")}
          {tab("spend-by-url", "Spend by URL")}
        </div>
        <AdminDateRangeToolbar filter={df} />
      </div>

      {viewMode === "ads" ? (
        <>
          <PlatformHourlyRevenueSection
            platform="tiktok"
            platformLabel="TikTok"
            startDate={df.startDate}
            endDate={df.endDate}
          />
          <TikTokAdBreakdownTable startDate={df.startDate} endDate={df.endDate} />
        </>
      ) : (
        <SpendByUrlSection
          platform="tiktok"
          startDate={df.startDate}
          endDate={df.endDate}
          dateReady={Boolean(df.startDate && df.endDate)}
        />
      )}
    </div>
  );
}
